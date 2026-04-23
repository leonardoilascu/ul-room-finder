import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import buildingData from '../data/buildings_csis.json'

function Home() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [focused, setFocused] = useState(false)
  const [mounted, setMounted] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    const query = searchQuery.toLowerCase().trim()
    const fuzzyMatch = (text: string, q: string) => {
      const t = text.toLowerCase(); let qi = 0
      for (let i = 0; i < t.length && qi < q.length; i++) if (t[i] === q[qi]) qi++
      return qi === q.length
    }
    const nodeRooms = (buildingData.nodes || [])
      .filter((n: any) => n.type === 'room')
      .map((r: any) => ({ id: r.id, label: r.label || r.id, floor: r.floor }))
    const polygonRooms = Object.entries(buildingData.room_polygons_by_floor || {})
      .flatMap(([floor, rooms]: [string, any]) =>
        rooms.map((r: any) => ({ id: r.id, label: r.label || r.id, floor: Number(floor) }))
      )
    const unique = [...nodeRooms, ...polygonRooms]
      .filter((r, i, self) => i === self.findIndex(x => x.id === r.id))
    const matches = unique.filter(r => {
      const label = r.label || r.id
      return label.toLowerCase().includes(query) || r.id.toLowerCase().includes(query) || fuzzyMatch(label, query)
    })
    setSearchResults(matches.slice(0, 8))
  }, [searchQuery])

  const floorLabel = (f: number) => f === 0 ? 'Ground Floor' : `Floor ${f}`

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Animated grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
      }} />

      {/* Glow blobs */}
      <div style={{
        position: 'absolute', top: '-200px', left: '50%', transform: 'translateX(-50%)',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '40%', left: '-100px',
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        maxWidth: '860px', margin: '0 auto', padding: '0 24px',
        position: 'relative', zIndex: 1,
      }}>

        {/* Header */}
        <div style={{
          paddingTop: '72px', paddingBottom: '56px', textAlign: 'center',
          opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.7s ease, transform 0.7s ease',
        }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: '999px', padding: '6px 16px', marginBottom: '28px',
            fontSize: '12px', fontWeight: 600, color: '#93c5fd', letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22d3ee', display: 'inline-block', boxShadow: '0 0 8px #22d3ee' }} />
            University of Limerick — CSIS Building
          </div>

          <h1 style={{
            fontSize: 'clamp(42px, 7vw, 72px)', fontWeight: 800,
            color: '#ffffff', lineHeight: 1.05, letterSpacing: '-0.03em',
            marginBottom: '16px',
          }}>
            UL Room{' '}
            <span style={{
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Finder
            </span>
          </h1>

          <p style={{
            fontSize: '17px', color: '#94a3b8', maxWidth: '480px',
            margin: '0 auto 40px', lineHeight: 1.7,
          }}>
            Accessible indoor navigation with interactive 2D maps and immersive 3D walkthroughs.
          </p>

          {/* CTA Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/2d-viewer')}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: '#fff', border: 'none', borderRadius: '12px',
                padding: '14px 28px', fontSize: '15px', fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 0 32px rgba(59,130,246,0.35)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 48px rgba(59,130,246,0.5)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 32px rgba(59,130,246,0.35)' }}
            >
              <span style={{ fontSize: '18px' }}>📍</span> Open 2D Map
            </button>
            <button
              onClick={() => navigate('/3d-viewer')}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'rgba(255,255,255,0.05)', color: '#e2e8f0',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px',
                padding: '14px 28px', fontSize: '15px', fontWeight: 600,
                cursor: 'pointer', backdropFilter: 'blur(8px)',
                transition: 'background 0.15s ease, transform 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.transform = 'none' }}
            >
              <span style={{ fontSize: '18px' }}>🏗️</span> 3D Flythrough
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{
          opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: focused ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px', padding: '6px 6px 6px 20px',
            display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: focused ? '0 0 0 4px rgba(59,130,246,0.1)' : 'none',
            transition: 'border 0.2s ease, box-shadow 0.2s ease',
            backdropFilter: 'blur(12px)',
          }}>
            <span style={{ fontSize: '20px', flexShrink: 0 }}>🔍</span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search rooms — try 'CS1-020', 'help desk', or just '026'…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: '#f1f5f9', fontSize: '16px', padding: '10px 0',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px',
                  color: '#94a3b8', padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                  flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div style={{
              marginTop: '8px', background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px',
              overflow: 'hidden', backdropFilter: 'blur(20px)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
            }}>
              <div style={{ padding: '10px 16px 6px', fontSize: '11px', fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </div>
              {searchResults.map((room, i) => (
                <div
                  key={room.id}
                  onClick={() => navigate('/2d-viewer', { state: { targetRoomId: room.id } })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', cursor: 'pointer',
                    borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(59,130,246,0.1)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'none'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', flexShrink: 0,
                    }}>🚪</div>
                    <div>
                      <div style={{ fontWeight: 600, color: '#f1f5f9', fontSize: '15px' }}>{room.label || room.id}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{floorLabel(room.floor)}</div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: '12px', fontWeight: 600, color: '#3b82f6',
                    background: 'rgba(59,130,246,0.1)', borderRadius: '6px',
                    padding: '4px 10px', flexShrink: 0,
                  }}>
                    Navigate →
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchQuery && searchResults.length === 0 && (
            <div style={{
              marginTop: '8px', padding: '16px 20px',
              background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
              borderRadius: '12px', color: '#fbbf24', fontSize: '14px',
            }}>
              No rooms found for "{searchQuery}". Try a different term.
            </div>
          )}
        </div>

        {/* Feature cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px', marginTop: '48px',
          opacity: mounted ? 1 : 0, transform: mounted ? 'none' : 'translateY(20px)',
          transition: 'opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s',
        }}>
          {[
            { icon: '♿', title: 'Accessible Routes', desc: 'Elevator-priority routing for wheelchair users and those with mobility needs.', color: '#22d3ee' },
            { icon: '🧠', title: 'A* Pathfinding', desc: 'Optimal route calculation using the A* algorithm with stair preference options.', color: '#a78bfa' },
            { icon: '🔊', title: 'Voice Guidance', desc: 'Step-by-step spoken directions with distances in metres and paces.', color: '#34d399' },
            { icon: '🏗️', title: '3D Walkthrough', desc: 'Immersive first-person 3D building navigation with floor-by-floor transitions.', color: '#fb923c' },
            { icon: '🔍', title: 'Fuzzy Search', desc: 'Finds rooms even with partial or approximate input — just type what you remember.', color: '#f472b6' },
            { icon: '🗺️', title: '2D Floorplan', desc: 'Interactive floorplan view with clickable rooms and highlighted route paths.', color: '#facc15' },
          ].map((f, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '16px', padding: '24px',
              transition: 'border 0.2s, transform 0.2s',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = f.color + '44'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
            >
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px', marginBottom: '16px',
                background: f.color + '18', border: `1px solid ${f.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
              }}>{f.icon}</div>
              <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '15px', marginBottom: '8px' }}>{f.title}</div>
              <div style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '48px', paddingBottom: '40px',
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '8px',
          opacity: mounted ? 1 : 0, transition: 'opacity 0.7s ease 0.45s',
        }}>
          <div style={{ fontSize: '13px', color: '#475569' }}>
            BSc Computer Systems — Final Year Project
          </div>
          <div style={{ fontSize: '13px', color: '#475569' }}>
            Leonardo Ilascu · Supervised by Dr. Katie Crowley · UL 2025/26
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
