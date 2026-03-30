import { useState, useEffect } from 'react'
import Toast from '../components/Toast'

// Theme definitions
const THEMES = {
  midnight: {
    name: 'Midnight',
    description: 'Default dark theme with warm accents',
    preview: ['#0a0b0f', '#111318', '#d4874a', '#00e5a0'],
    vars: {
      '--bg': '#0a0b0f',
      '--surface': '#111318',
      '--surface2': '#181b22',
      '--surface3': '#1e2129',
      '--border': 'rgba(255,255,255,0.07)',
      '--border2': 'rgba(255,255,255,0.13)',
      '--accent': '#d4874a',
      '--accent2': '#b86d32',
      '--accent-dim': 'rgba(212,135,74,0.12)',
      '--text': '#e8eaf0',
      '--text2': '#9aa0b0',
      '--text3': '#5a6070',
    }
  },
  malkia: {
    name: 'Malkia',
    description: 'Teal & blush brand colors',
    preview: ['#0f1419', '#1a2027', '#85c2be', '#f7a6ad'],
    vars: {
      '--bg': '#0f1419',
      '--surface': '#1a2027',
      '--surface2': '#232b33',
      '--surface3': '#2c353f',
      '--border': 'rgba(133,194,190,0.12)',
      '--border2': 'rgba(133,194,190,0.22)',
      '--accent': '#85c2be',
      '--accent2': '#6ba8a4',
      '--accent-dim': 'rgba(133,194,190,0.12)',
      '--text': '#e8eaf0',
      '--text2': '#9aa0b0',
      '--text3': '#5a6070',
    }
  },
  accountant: {
    name: 'Accountant',
    description: 'Classic dark with blue accents',
    preview: ['#0d1117', '#161b22', '#58a6ff', '#3fb950'],
    vars: {
      '--bg': '#0d1117',
      '--surface': '#161b22',
      '--surface2': '#1c2128',
      '--surface3': '#22272e',
      '--border': 'rgba(48,54,61,0.8)',
      '--border2': 'rgba(48,54,61,1)',
      '--accent': '#58a6ff',
      '--accent2': '#388bfd',
      '--accent-dim': 'rgba(88,166,255,0.12)',
      '--text': '#c9d1d9',
      '--text2': '#8b949e',
      '--text3': '#6e7681',
    }
  },
  obsidian: {
    name: 'Obsidian',
    description: 'Pure black with purple highlights',
    preview: ['#000000', '#0d0d0d', '#a855f7', '#f472b6'],
    vars: {
      '--bg': '#000000',
      '--surface': '#0d0d0d',
      '--surface2': '#171717',
      '--surface3': '#1f1f1f',
      '--border': 'rgba(255,255,255,0.06)',
      '--border2': 'rgba(255,255,255,0.12)',
      '--accent': '#a855f7',
      '--accent2': '#9333ea',
      '--accent-dim': 'rgba(168,85,247,0.12)',
      '--text': '#fafafa',
      '--text2': '#a1a1aa',
      '--text3': '#71717a',
    }
  },
  forest: {
    name: 'Forest',
    description: 'Deep greens for nature lovers',
    preview: ['#0c1210', '#121a17', '#10b981', '#34d399'],
    vars: {
      '--bg': '#0c1210',
      '--surface': '#121a17',
      '--surface2': '#1a2520',
      '--surface3': '#223029',
      '--border': 'rgba(16,185,129,0.12)',
      '--border2': 'rgba(16,185,129,0.22)',
      '--accent': '#10b981',
      '--accent2': '#059669',
      '--accent-dim': 'rgba(16,185,129,0.12)',
      '--text': '#e8f0ec',
      '--text2': '#9aaca2',
      '--text3': '#5a706a',
    }
  },
  light: {
    name: 'Light',
    description: 'Clean white background',
    preview: ['#ffffff', '#f8fafc', '#0ea5e9', '#10b981'],
    vars: {
      '--bg': '#f8fafc',
      '--surface': '#ffffff',
      '--surface2': '#f1f5f9',
      '--surface3': '#e2e8f0',
      '--border': 'rgba(0,0,0,0.08)',
      '--border2': 'rgba(0,0,0,0.15)',
      '--accent': '#0ea5e9',
      '--accent2': '#0284c7',
      '--accent-dim': 'rgba(14,165,233,0.12)',
      '--text': '#0f172a',
      '--text2': '#475569',
      '--text3': '#94a3b8',
    }
  },
  sepia: {
    name: 'Sepia',
    description: 'Warm paper-like tones',
    preview: ['#f5f1e8', '#ebe5d8', '#b45309', '#059669'],
    vars: {
      '--bg': '#f5f1e8',
      '--surface': '#fffbf5',
      '--surface2': '#ebe5d8',
      '--surface3': '#ddd6c8',
      '--border': 'rgba(0,0,0,0.08)',
      '--border2': 'rgba(0,0,0,0.15)',
      '--accent': '#b45309',
      '--accent2': '#92400e',
      '--accent-dim': 'rgba(180,83,9,0.12)',
      '--text': '#292524',
      '--text2': '#57534e',
      '--text3': '#a8a29e',
    }
  },
  nord: {
    name: 'Nord',
    description: 'Arctic blue-gray palette',
    preview: ['#2e3440', '#3b4252', '#88c0d0', '#a3be8c'],
    vars: {
      '--bg': '#2e3440',
      '--surface': '#3b4252',
      '--surface2': '#434c5e',
      '--surface3': '#4c566a',
      '--border': 'rgba(216,222,233,0.1)',
      '--border2': 'rgba(216,222,233,0.2)',
      '--accent': '#88c0d0',
      '--accent2': '#81a1c1',
      '--accent-dim': 'rgba(136,192,208,0.15)',
      '--text': '#eceff4',
      '--text2': '#d8dee9',
      '--text3': '#7b88a1',
    }
  },
}

type ThemeKey = keyof typeof THEMES

// Font size options
const FONT_SIZES = [
  { value: 12, label: 'Compact', description: 'More data on screen' },
  { value: 14, label: 'Default', description: 'Balanced readability' },
  { value: 16, label: 'Large', description: 'Easier to read' },
  { value: 18, label: 'Extra Large', description: 'Maximum readability' },
]

// Sidebar options
const SIDEBAR_OPTIONS = [
  { value: 68, label: 'Compact', description: 'Icons only' },
  { value: 200, label: 'Expanded', description: 'Icons + labels' },
]

// Border radius options
const RADIUS_OPTIONS = [
  { value: 0, label: 'Sharp', description: 'No rounded corners' },
  { value: 6, label: 'Subtle', description: 'Slight rounding' },
  { value: 10, label: 'Default', description: 'Standard rounding' },
  { value: 16, label: 'Rounded', description: 'More rounded' },
  { value: 24, label: 'Pill', description: 'Very rounded' },
]

export default function DisplaySettings() {
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  
  // Settings state
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>('midnight')
  const [fontSize, setFontSize] = useState(14)
  const [sidebarWidth, setSidebarWidth] = useState(68)
  const [borderRadius, setBorderRadius] = useState(10)
  const [animationsEnabled, setAnimationsEnabled] = useState(true)
  const [compactMode, setCompactMode] = useState(false)
  const [showGridLines, setShowGridLines] = useState(true)
  const [highlightOnHover, setHighlightOnHover] = useState(true)
  const [monoNumbers, setMonoNumbers] = useState(true)
  const [stickyHeaders, setStickyHeaders] = useState(true)

  // Load saved settings on mount
  useEffect(() => {
    const saved = localStorage.getItem('malkia_display_settings')
    if (saved) {
      try {
        const settings = JSON.parse(saved)
        if (settings.theme) setCurrentTheme(settings.theme)
        if (settings.fontSize) setFontSize(settings.fontSize)
        if (settings.sidebarWidth) setSidebarWidth(settings.sidebarWidth)
        if (settings.borderRadius !== undefined) setBorderRadius(settings.borderRadius)
        if (settings.animationsEnabled !== undefined) setAnimationsEnabled(settings.animationsEnabled)
        if (settings.compactMode !== undefined) setCompactMode(settings.compactMode)
        if (settings.showGridLines !== undefined) setShowGridLines(settings.showGridLines)
        if (settings.highlightOnHover !== undefined) setHighlightOnHover(settings.highlightOnHover)
        if (settings.monoNumbers !== undefined) setMonoNumbers(settings.monoNumbers)
        if (settings.stickyHeaders !== undefined) setStickyHeaders(settings.stickyHeaders)
        // Apply theme on load
        applyTheme(settings.theme || 'midnight')
        applyFontSize(settings.fontSize || 14)
        applyBorderRadius(settings.borderRadius ?? 10)
      } catch {}
    }
  }, [])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { 
    setToast(msg)
    setToastType(type) 
  }

  const applyTheme = (themeKey: ThemeKey) => {
    const theme = THEMES[themeKey]
    if (!theme) return
    const root = document.documentElement
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }

  const applyFontSize = (size: number) => {
    document.documentElement.style.fontSize = `${size}px`
  }

  const applyBorderRadius = (radius: number) => {
    document.documentElement.style.setProperty('--r', `${radius}px`)
    document.documentElement.style.setProperty('--rl', `${radius + 6}px`)
  }

  const handleThemeChange = (themeKey: ThemeKey) => {
    setCurrentTheme(themeKey)
    applyTheme(themeKey)
  }

  const handleFontSizeChange = (size: number) => {
    setFontSize(size)
    applyFontSize(size)
  }

  const handleRadiusChange = (radius: number) => {
    setBorderRadius(radius)
    applyBorderRadius(radius)
  }

  const saveSettings = () => {
    const settings = {
      theme: currentTheme,
      fontSize,
      sidebarWidth,
      borderRadius,
      animationsEnabled,
      compactMode,
      showGridLines,
      highlightOnHover,
      monoNumbers,
      stickyHeaders,
    }
    localStorage.setItem('malkia_display_settings', JSON.stringify(settings))
    showToast('Display settings saved')
  }

  const resetDefaults = () => {
    setCurrentTheme('midnight')
    setFontSize(14)
    setSidebarWidth(68)
    setBorderRadius(10)
    setAnimationsEnabled(true)
    setCompactMode(false)
    setShowGridLines(true)
    setHighlightOnHover(true)
    setMonoNumbers(true)
    setStickyHeaders(true)
    applyTheme('midnight')
    applyFontSize(14)
    applyBorderRadius(10)
    localStorage.removeItem('malkia_display_settings')
    showToast('Settings reset to defaults')
  }

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div 
      onClick={() => onChange(!value)} 
      style={{ 
        width: 44, height: 24, 
        background: value ? 'var(--accent)' : 'var(--surface3)', 
        borderRadius: 12, cursor: 'pointer', 
        position: 'relative', transition: 'background .2s', 
        flexShrink: 0 
      }}
    >
      <div style={{ 
        position: 'absolute', top: 2, 
        left: value ? 22 : 2, 
        width: 20, height: 20, 
        background: '#fff', borderRadius: '50%', 
        transition: 'left .2s', 
        boxShadow: '0 1px 4px rgba(0,0,0,.3)' 
      }} />
    </div>
  )

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <div className="page-title">Display Settings</div>
          <div className="page-sub">Customize the look and feel of MalkiaOS</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={resetDefaults}>Reset Defaults</button>
          <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
        </div>
      </div>

      {/* Theme Selection */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Color Theme</div>
        <div className="card-sub" style={{ marginBottom: 20 }}>Choose a color scheme that suits your preference</div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {(Object.entries(THEMES) as [ThemeKey, typeof THEMES[ThemeKey]][]).map(([key, theme]) => (
            <div 
              key={key}
              onClick={() => handleThemeChange(key)}
              style={{ 
                padding: 14,
                background: currentTheme === key ? 'var(--accent-dim)' : 'var(--surface2)',
                border: `2px solid ${currentTheme === key ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {/* Color preview */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                {theme.preview.map((color, i) => (
                  <div key={i} style={{ 
                    width: 24, height: 24, 
                    borderRadius: 6, 
                    background: color,
                    border: '1px solid rgba(255,255,255,0.1)'
                  }} />
                ))}
              </div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>
                {theme.name}
                {currentTheme === key && <span style={{ marginLeft: 6, color: 'var(--accent)' }}>✓</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{theme.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g2" style={{ gap: 20, marginBottom: 20 }}>
        {/* Typography */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Typography</div>
          <div className="card-sub" style={{ marginBottom: 20 }}>Adjust text size for readability</div>
          
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Base Font Size</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {FONT_SIZES.map(size => (
                <div 
                  key={size.value}
                  onClick={() => handleFontSizeChange(size.value)}
                  style={{ 
                    flex: 1,
                    padding: '10px 12px',
                    background: fontSize === size.value ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: `1px solid ${fontSize === size.value ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: size.value, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{size.value}px</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>{size.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Monospace Numbers</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Use fixed-width digits for alignment</div>
            </div>
            <Toggle value={monoNumbers} onChange={setMonoNumbers} />
          </div>
        </div>

        {/* Layout */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Layout</div>
          <div className="card-sub" style={{ marginBottom: 20 }}>Customize spacing and corners</div>
          
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Border Radius</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {RADIUS_OPTIONS.map(opt => (
                <div 
                  key={opt.value}
                  onClick={() => handleRadiusChange(opt.value)}
                  style={{ 
                    flex: 1,
                    padding: '10px 8px',
                    background: borderRadius === opt.value ? 'var(--accent-dim)' : 'var(--surface2)',
                    border: `1px solid ${borderRadius === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: opt.value,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{opt.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Compact Mode</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Reduce padding throughout the UI</div>
            </div>
            <Toggle value={compactMode} onChange={setCompactMode} />
          </div>
        </div>
      </div>

      {/* Tables & Data */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Tables & Data Display</div>
        <div className="card-sub" style={{ marginBottom: 20 }}>How data is presented in tables and lists</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Show Grid Lines</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Display borders between table rows</div>
            </div>
            <Toggle value={showGridLines} onChange={setShowGridLines} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Highlight on Hover</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Highlight rows when hovering</div>
            </div>
            <Toggle value={highlightOnHover} onChange={setHighlightOnHover} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Sticky Headers</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Keep table headers visible when scrolling</div>
            </div>
            <Toggle value={stickyHeaders} onChange={setStickyHeaders} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Animations</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Enable smooth transitions</div>
            </div>
            <Toggle value={animationsEnabled} onChange={setAnimationsEnabled} />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="card">
        <div className="card-title" style={{ marginBottom: 6 }}>Preview</div>
        <div className="card-sub" style={{ marginBottom: 20 }}>See how your settings look</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div className="stat-card amber">
            <div className="stat-icon">💰</div>
            <div className="stat-label">Revenue</div>
            <div className="stat-value">2.4M</div>
            <div className="stat-change up">↑ 12%</div>
          </div>
          <div className="stat-card green">
            <div className="stat-icon">📦</div>
            <div className="stat-label">Orders</div>
            <div className="stat-value">847</div>
            <div className="stat-change up">↑ 8%</div>
          </div>
          <div className="stat-card blue">
            <div className="stat-icon">👥</div>
            <div className="stat-label">Customers</div>
            <div className="stat-value">1,234</div>
            <div className="stat-change up">↑ 15%</div>
          </div>
          <div className="stat-card red">
            <div className="stat-icon">📉</div>
            <div className="stat-label">Returns</div>
            <div className="stat-value">23</div>
            <div className="stat-change down">↓ 5%</div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Customer</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="td-mono">2026-03-30</td>
                <td className="td-mono" style={{ color: 'var(--accent)' }}>CS-10-0042</td>
                <td className="td-bold">Angela Laurian</td>
                <td><span className="pill pill-green">Posted</span></td>
                <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>150,000</td>
              </tr>
              <tr>
                <td className="td-mono">2026-03-30</td>
                <td className="td-mono" style={{ color: 'var(--accent)' }}>CS-10-0041</td>
                <td className="td-bold">Baraka Zakayo</td>
                <td><span className="pill pill-yellow">Draft</span></td>
                <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>85,000</td>
              </tr>
              <tr>
                <td className="td-mono">2026-03-29</td>
                <td className="td-mono" style={{ color: 'var(--accent)' }}>CS-10-0040</td>
                <td className="td-bold">Erica Matenga</td>
                <td><span className="pill pill-green">Posted</span></td>
                <td className="td-mono" style={{ textAlign: 'right', color: 'var(--green)' }}>220,000</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="btn btn-primary">Primary Button</button>
          <button className="btn btn-ghost">Ghost Button</button>
          <button className="btn btn-success">Success</button>
          <button className="btn btn-danger">Danger</button>
          <span className="pill pill-amber">Amber Pill</span>
          <span className="pill pill-blue">Blue Pill</span>
        </div>
      </div>

      {toast && <Toast message={toast} type={toastType} onClose={() => setToast('')} />}
    </div>
  )
}
