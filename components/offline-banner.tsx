'use client'

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [online, setOnline] = useState(true)
  const [visible, setVisible] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    const update = () => {
      const isOnline = navigator.onLine
      setOnline(isOnline)
      if (!isOnline) {
        setWasOffline(true)
        setExiting(false)
        setVisible(true)
      }
    }

    const handleOnline = () => {
      setOnline(true)
      // Keep banner visible briefly to confirm reconnection, then smoothly exit
      setTimeout(() => {
        setExiting(true)
        setTimeout(() => setVisible(false), 400)
      }, 2200)
    }

    const handleOffline = () => {
      setOnline(false)
      setWasOffline(true)
      setExiting(false)
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
        gap: '8px',
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: 600,
        letterSpacing: '0.01em',
        background: online
          ? 'linear-gradient(135deg, #14532d, #166534)'
          : 'linear-gradient(135deg, #1a0a00, #2a1000)',
        color: online ? '#86efac' : '#fb923c',
        borderBottom: `1px solid ${online ? '#166534' : '#7c2d12'}`,
        backdropFilter: 'blur(12px)',
        transition: 'background 0.5s cubic-bezier(0.22,1,0.36,1), color 0.5s cubic-bezier(0.22,1,0.36,1), transform 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease',
        animation: exiting ? undefined : 'rh-banner-in 0.4s cubic-bezier(0.22,1,0.36,1)',
        transform: exiting ? 'translateY(-100%)' : 'translateY(0)',
        opacity: exiting ? 0 : 1,
      }}
    >
      <style>{`
        @keyframes rh-banner-in {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes rh-pulse-dot {
          0%, 100% { box-shadow: 0 0 6px currentColor; }
          50%      { box-shadow: 0 0 14px currentColor; }
        }
      `}</style>
      {online ? (
        <>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0,
            boxShadow: '0 0 8px #4ade80',
            animation: 'rh-pulse-dot 1.5s ease-in-out infinite',
          }} />
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
