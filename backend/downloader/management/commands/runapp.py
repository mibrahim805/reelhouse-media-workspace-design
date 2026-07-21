import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


HOST = '127.0.0.1'
FRONTEND_PORT = 3000
BACKEND_PORT = 8001
STARTUP_TIMEOUT = 30


def _process_is_running(pid):
    if not isinstance(pid, int) or pid <= 0:
        return False

    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return True


def _clear_stale_next_dev_cache(frontend_dir):
    dev_dir = frontend_dir / '.next' / 'dev'
    lock_path = dev_dir / 'lock'
    if not lock_path.exists():
        return False

    try:
        lock = json.loads(lock_path.read_text(encoding='utf-8'))
        pid = lock.get('pid')
    except (OSError, ValueError, AttributeError):
        pid = None

    if _process_is_running(pid):
        return False

    # `.next/dev` is generated state. A dead PID in its lock means Next was
    # interrupted and can otherwise leave localhost:3000 unavailable.
    shutil.rmtree(dev_dir, ignore_errors=True)
    return True


def _port_is_open(port):
    try:
        with socket.create_connection((HOST, port), timeout=0.25):
            return True
    except OSError:
        return False


def _stop_process(process):
    if process.poll() is not None:
        return

    try:
        if os.name == 'posix':
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
        process.wait(timeout=5)
    except (OSError, subprocess.TimeoutExpired):
        if process.poll() is None:
            if os.name == 'posix':
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
            process.wait(timeout=5)


class Command(BaseCommand):
    help = 'Start the Reelhouse Next.js frontend and Django backend together.'

    def handle(self, *args, **options):
        backend_dir = Path(settings.BASE_DIR)
        project_dir = backend_dir.parent
        frontend_dir = project_dir / 'frontend'
        package_json = frontend_dir / 'package.json'
        next_binary = frontend_dir / 'node_modules' / '.bin' / 'next'
        npm = shutil.which('npm')

        if npm is None:
            raise CommandError('npm was not found. Install Node.js and npm first.')
        if not package_json.exists():
            raise CommandError(f'Frontend package not found: {package_json}')
        if not next_binary.exists():
            raise CommandError(
                f'Frontend dependencies are missing. Run `npm install` in {frontend_dir}.'
            )

        if _port_is_open(FRONTEND_PORT):
            raise CommandError(
                f'Port {FRONTEND_PORT} is already in use. Stop the existing frontend first.'
            )
        if _port_is_open(BACKEND_PORT):
            raise CommandError(
                f'Port {BACKEND_PORT} is already in use. Stop the existing backend first.'
            )

        if _clear_stale_next_dev_cache(frontend_dir):
            self.stdout.write('Removed a stale Next.js development lock.')

        popen_options = {'start_new_session': True} if os.name == 'posix' else {}
        frontend = subprocess.Popen(
            [
                npm,
                'run',
                'dev',
                '--',
                '--hostname',
                HOST,
                '--port',
                str(FRONTEND_PORT),
            ],
            cwd=frontend_dir,
            **popen_options,
        )
        backend = subprocess.Popen(
            [
                sys.executable,
                str(backend_dir / 'manage.py'),
                'runserver',
                f'{HOST}:{BACKEND_PORT}',
                '--noreload',
            ],
            cwd=backend_dir,
            **popen_options,
        )

        processes = {'frontend': frontend, 'backend': backend}

        def stop_on_signal(signum, frame):
            raise KeyboardInterrupt

        previous_sigterm = signal.getsignal(signal.SIGTERM)
        signal.signal(signal.SIGTERM, stop_on_signal)

        try:
            deadline = time.monotonic() + STARTUP_TIMEOUT
            while time.monotonic() < deadline:
                for name, process in processes.items():
                    return_code = process.poll()
                    if return_code is not None:
                        raise CommandError(
                            f'The {name} server exited during startup with code '
                            f'{return_code}.'
                        )

                if _port_is_open(FRONTEND_PORT) and _port_is_open(BACKEND_PORT):
                    break
                time.sleep(0.25)
            else:
                raise CommandError(
                    'The application did not become ready within '
                    f'{STARTUP_TIMEOUT} seconds.'
                )

            self.stdout.write('')
            self.stdout.write(
                self.style.SUCCESS(
                    f'Reelhouse is ready: http://localhost:{FRONTEND_PORT}'
                )
            )
            self.stdout.write(
                f'Django API: http://{HOST}:{BACKEND_PORT}  '
                '(press Ctrl+C to stop both servers)'
            )

            while True:
                for name, process in processes.items():
                    return_code = process.poll()
                    if return_code is not None:
                        raise CommandError(
                            f'The {name} server stopped with code {return_code}.'
                        )
                time.sleep(0.5)
        except KeyboardInterrupt:
            self.stdout.write('\nStopping Reelhouse...')
        finally:
            signal.signal(signal.SIGTERM, previous_sigterm)
            _stop_process(frontend)
            _stop_process(backend)
