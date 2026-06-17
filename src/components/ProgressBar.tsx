interface Props {
  current: number
  total: number
}

export default function ProgressBar({ current, total }: Props) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="progress-bar-wrap">
      <div
        className="progress-bar-fill"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
