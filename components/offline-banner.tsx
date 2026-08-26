'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [visible, setVisible] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine
      setOnline(isOnline)
      if (!isOnline) {
        setWasOffline(true)
        setVisible(true)
      }
    }

    const handleOnline = () => {
      setOnline(true)
      // Keep banner visible briefly to confirm reconnection, then fade out
      setTimeout(() => setVisible(false), 2500)
    }

    const handleOffline = () => {
      setOnline(false)
      setWasOffline(true)
      setVisible(true)
    }

    update()
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '7px 16px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.01em',
        background: online ? '#14532d' : '#1a0a00',
        color: online ? '#86efac' : '#fb923c',
        borderBottom: `1px solid ${online ? '#166534' : '#7c2d12'}`,
        transition: 'background 0.3s, color 0.3s',
        animation: 'rh-banner-in 0.25s ease',
      }}
    >
      <style>{`
        @keyframes rh-banner-in {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      {online ? (
        <>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0, boxShadow: '0 0 6px #4ade80' }} />
          Back online
        </>
      ) : (
        <>
          <WifiOff style={{ width: 13, height: 13, flexShrink: 0 }} />
          You&apos;re offline &mdash; library &amp; downloads still available
        </>
      )}
    </div>
  )
}
