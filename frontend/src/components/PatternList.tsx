interface Props {
  patterns: any[]
}

export default function PatternList({ patterns }: Props) {
  if (!patterns?.length) return null
  return (
    <div className="space-y-2">
      {patterns.map((p, i) => (
        <div key={i} className="text-xs text-gray-500 bg-gray-50
                                rounded px-3 py-2">
          <span className="font-medium text-gray-700">{p.pattern}</span>
          {' — '}{p.description}
        </div>
      ))}
    </div>
  )
}