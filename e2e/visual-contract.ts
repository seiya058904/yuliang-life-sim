import { expect, type Locator } from '@playwright/test';

// Baseline contracts follow DESIGN.md and the current console, rather than
// absolute coordinates from the historical four-image reference pack.
export const CONSOLE_PANEL = 'rgb(9, 9, 9)';
export const CONSOLE_INK = 'rgb(245, 245, 241)';

export async function expectSelectionFrame(cards: Locator) {
  const frames = await cards.evaluateAll(elements => elements.map(element => {
    const border = getComputedStyle(element);
    const after = getComputedStyle(element, '::after');
    // A pseudo-element with content:none paints nothing. Shop and Career use
    // their real borders; other shared pixel surfaces can paint in ::after.
    const paint = after.content !== 'none' && after.display !== 'none' ? after : border;
    return { selected: element.classList.contains('selected'), color: paint.borderTopColor };
  }));
  expect(frames.length).toBeGreaterThan(1);
  const selected = frames.filter(frame => frame.selected);
  expect(selected).toHaveLength(1);
  expect(selected[0].color).toBe(CONSOLE_INK);
  const brightness = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).reduce((sum, value) => sum + value, 0);
  expect(frames.filter(frame => !frame.selected).every(frame => brightness(frame.color) < brightness(selected[0].color))).toBe(true);
}

export async function expectSquarePixelSurfaces(surfaces: Locator, count?: number) {
  const frames = await surfaces.evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    const after = getComputedStyle(element, '::after');
    return {
      radius: style.borderRadius,
      shadow: style.boxShadow,
      image: style.backgroundImage,
      framed: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].some(key => parseFloat(style[key as keyof CSSStyleDeclaration] as string) >= 1)
        || (after.content !== 'none' && parseFloat(after.borderTopWidth) >= 1)
        || element.classList.contains('inverse'),
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      // Pixel corner pseudo-elements can extend into the physical border.
      // Measure actual content instead of counting those painted edge marks
      // as horizontal data overflow.
      contentFits: Array.from(element.children).filter(child => getComputedStyle(child).display !== 'none').every(child => {
        const frame = element.getBoundingClientRect(), content = child.getBoundingClientRect();
        return content.left >= frame.left - 0.5 && content.right <= frame.right + 0.5;
      }),
    };
  }));
  if (count !== undefined) expect(frames).toHaveLength(count);
  expect(frames.length, '必须检查实际存在的面板').toBeGreaterThan(0);
  for (const frame of frames) {
    expect(frame.radius).toBe('0px');
    // DESIGN.md permits an inset double line; a zero-blur inset is a frame.
    const insetFrame = /^rgb\([\d, ]+\) 0px 0px 0px [12]px inset$/.test(frame.shadow);
    expect(frame.shadow === 'none' || insetFrame, '普通面板不得出现偏移或模糊投影').toBe(true);
    expect(frame.image).toBe('none');
    expect(frame.framed, '分区需要清楚的边框或反色面').toBe(true);
    expect(frame.overflowX).not.toBe('scroll');
    expect(frame.overflowY).not.toBe('scroll');
    expect(frame.contentFits, '真实内容必须留在面板边界内').toBe(true);
  }
}

export async function expectReadableContrast(text: Locator) {
  const ratios = await text.evaluateAll(elements => {
    const rgb = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (color: number[]) => color.map(channel => {
      const s = channel / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    return elements.map(element => {
      let ancestor: Element | null = element;
      let background = 'rgb(0, 0, 0)';
      while (ancestor) {
        const color = getComputedStyle(ancestor).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') { background = color; break; }
        ancestor = ancestor.parentElement;
      }
      const foreground = luminance(rgb(getComputedStyle(element).color));
      const behind = luminance(rgb(background));
      return { text: element.textContent?.trim(), ratio: (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05) };
    });
  });
  expect(ratios.length, '必须检查真实文案的对比度').toBeGreaterThan(0);
  for (const reading of ratios) expect(reading.ratio, `${reading.text} 必须达到正文 AA 对比度`).toBeGreaterThanOrEqual(4.5);
}

export async function expectReadableCatalog(cards: Locator, kind: 'goods' | 'activities') {
  await expect(cards).toHaveCount(6);
  const geometry = await cards.evaluateAll((elements, kind) => elements.map(card => {
    const frame = card.getBoundingClientRect();
    const art = card.querySelector('.card-art')!.getBoundingClientRect();
    const title = card.querySelector(kind === 'goods' ? 'h2' : 'h3')!;
    const facts = card.querySelector('.catalog-facts')!;
    const button = card.querySelector(kind === 'goods' ? '.item-card-foot button' : '.activity-card-body > button')!;
    const action = button.getBoundingClientRect();
    return {
      height: frame.height,
      artWidth: art.width, artHeight: art.height,
      titleSize: parseFloat(getComputedStyle(title).fontSize),
      factSizes: Array.from(facts.querySelectorAll('dt,dd')).map(el => parseFloat(getComputedStyle(el).fontSize)),
      factsBottom: facts.getBoundingClientRect().bottom,
      actionTop: action.top, actionBottom: action.bottom, actionHeight: action.height,
      frameBottom: frame.bottom,
      actionSize: parseFloat(getComputedStyle(button).fontSize),
      factsFit: facts.scrollWidth <= facts.clientWidth,
    };
  }), kind);
  for (const card of geometry) {
    expect(card.height).toBeGreaterThanOrEqual(200);
    expect(card.artWidth).toBe(48);
    expect(card.artHeight).toBe(48);
    expect(card.titleSize).toBeGreaterThanOrEqual(16);
    expect(Math.min(...card.factSizes)).toBeGreaterThanOrEqual(12);
    expect(card.actionSize).toBeGreaterThanOrEqual(12);
    expect(card.actionHeight).toBeGreaterThanOrEqual(36);
    expect(card.factsBottom).toBeLessThanOrEqual(card.actionTop);
    expect(card.actionBottom).toBeLessThanOrEqual(card.frameBottom - 1);
    expect(card.factsFit).toBe(true);
  }
  await expectSquarePixelSurfaces(cards, 6);
  await expectReadableContrast(cards.locator('.catalog-facts :is(dt,dd)'));
}
