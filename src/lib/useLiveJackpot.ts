import { useEffect, useState } from 'react'

export function useLiveJackpot(initial = 8437219) {
  const [jackpot, setJackpot] = useState(initial)
  useEffect(() => {
    const id = window.setInterval(() => {
      setJackpot((v) => v + Math.floor(Math.random() * 40 + 5))
    }, 1500)
    return () => clearInterval(id)
  }, [])
  return jackpot
}
