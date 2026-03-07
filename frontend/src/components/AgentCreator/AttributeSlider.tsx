interface AttributeSliderProps {
  label: string
  lowLabel: string
  highLabel: string
  value: number
  onChange: (value: number) => void
}

export function AttributeSlider({ label, lowLabel, highLabel, value, onChange }: AttributeSliderProps) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-300">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-gray-600">{lowLabel}</span>
        <span className="text-[10px] text-gray-600">{highLabel}</span>
      </div>
    </div>
  )
}
