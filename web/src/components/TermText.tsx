import { Fragment, type ReactNode } from 'react'

/**
 * One translatable sentence with glossary links inside it. The translated string carries `{name}` placeholders and
 * `terms` maps each name to the node to show (usually a <Term id="..." />), so a translator can move a term anywhere
 * in the sentence.
 */
export function TermText({ text, terms }: { text: string; terms: Record<string, ReactNode> }) {
  const parts = text.split(/(\{\w+\})/)
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\{(\w+)\}$/.exec(part)
        return <Fragment key={i}>{m && m[1] in terms ? terms[m[1]] : part}</Fragment>
      })}
    </>
  )
}
