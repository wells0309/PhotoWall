export class PageFlip {
  constructor(element: HTMLElement, settings: Record<string, number | string | boolean>)
  loadFromHTML(elements: HTMLElement[]): void
  on(event: string, callback: (event: { data: number | string }) => void): void
  getCurrentPageIndex(): number
  getOrientation(): 'portrait' | 'landscape'
  flipNext(corner?: 'top' | 'bottom'): void
  flipPrev(corner?: 'top' | 'bottom'): void
  turnToPage(index: number): void
  destroy(): void
}
