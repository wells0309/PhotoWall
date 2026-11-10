import { useState, type CSSProperties } from 'react'

function createStars() {
  return Array.from({ length: 150 + Math.floor(Math.random() * 61) }, (_, id) => ({
    id,
    x: 2 + Math.random() * 96,
    y: 3 + Math.random() * 94,
    size: 1 + Math.random() * 1.6,
    opacity: 0.55 + Math.random() * 0.4,
    duration: 3 + Math.random() * 5,
    delay: -Math.random() * 8,
    sparkle: Math.random() < 0.08,
  }))
}

export default function GlobeStars() {
  // Keep the same sky while the map moves, zooms, or changes theme.
  const [stars] = useState(createStars)
  return <div className="globe-stars" aria-hidden="true">
    {stars.map(star => <span key={star.id} className={`globe-star${star.sparkle ? ' globe-star-sparkle' : ''}`} style={{
      left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size,
      '--star-opacity': star.opacity, animationDuration: `${star.duration}s`, animationDelay: `${star.delay}s`,
    } as CSSProperties} />)}
  </div>
}
