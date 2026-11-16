import type { Chosen } from '../lib/places'

interface Props {
  /** the place picked in step 1 */
  chosen: Chosen
  /** open this question (theme id) for the chosen place */
  onAsk: (themeId: string) => void
}

/** Step 2: questions an AI helper suggests for this kind of place, as buttons. Renders nothing without suggestions. */
export function SuggestedQuestions(_props: Props) {
  return null
}
