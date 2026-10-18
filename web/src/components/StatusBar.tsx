type Props = { left: string; middle: string; right: string; tone?: 'live' | 'solved' | 'lost' }

export function StatusBar({ left, middle, right, tone = 'live' }: Props) {
  return (
    <div class="statusbar">
      <span>{left}</span>
      <span>{middle}</span>
      <span class={`tone-${tone}`}>● {right}</span>
    </div>
  )
}
