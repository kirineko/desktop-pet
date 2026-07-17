import DOMPurify from 'dompurify'
import { marked } from 'marked'

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td'
]

export function renderChatMarkdown(source: string): string {
  const parsed = marked.parse(source, {
    async: false,
    breaks: true,
    gfm: true
  }) as string
  const clean = DOMPurify.sanitize(parsed, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title', 'class']
  })

  const template = document.createElement('template')
  template.innerHTML = clean
  for (const link of template.content.querySelectorAll<HTMLAnchorElement>('a')) {
    const href = link.getAttribute('href') ?? ''
    if (!/^https?:\/\//i.test(href)) {
      link.removeAttribute('href')
      continue
    }
    link.target = '_blank'
    link.rel = 'noreferrer noopener'
  }
  return template.innerHTML
}
