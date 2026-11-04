'use client'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Checkbox({ checked, onChange, disabled = false }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="checkbox"
      data-checked={checked}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {checked && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary-contrast)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'checkPop 0.3s ease' }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  )
}
