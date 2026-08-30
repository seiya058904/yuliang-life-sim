import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PixelClock } from './PixelUI';
import { PixelIcon } from './PixelIcon';
import { PixelIllustration } from './PixelIllustration';

describe('PixelClock', () => {
  it('renders accessible time text alongside hard 1-bit glyphs', () => {
    render(<PixelClock value="08:00" data-testid="pixel-clock" />);

    const clock = screen.getByTestId('pixel-clock');
    expect(clock).toHaveAttribute('aria-label', '08:00');
    expect(clock).toHaveTextContent('08:00');
    expect(clock.querySelectorAll('.pixel-clock-glyph')).toHaveLength(5);
    expect(clock.querySelectorAll('.pixel-clock-glyph .filled').length).toBeGreaterThan(0);
  });
});

describe('PixelIcon', () => {
  it('uses a readable hard-edged 1-bit glyph for shared icons', () => {
    render(<PixelIcon name="home" data-testid="pixel-icon" />);

    const icon = screen.getByTestId('pixel-icon');
    expect(icon).toHaveAttribute('stroke-width', '2.5');
    expect(icon).toHaveAttribute('shape-rendering', 'crispEdges');
    expect(icon).toHaveAttribute('viewBox', '0 0 16 16');
    expect(icon.querySelectorAll('rect').length).toBeGreaterThan(24);
    expect(icon.querySelectorAll('rect').length).toBeGreaterThan(0);
    expect(icon.querySelectorAll('path')).toHaveLength(0);
  });

  it('keeps the settings icon on a stepped gear silhouette', () => {
    render(<PixelIcon name="settings" data-testid="settings-icon" />);

    const icon = screen.getByTestId('settings-icon');
    const cells = [...icon.querySelectorAll('rect')];
    const hasCell = (x: string, y: string) => cells.some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y &&
      rect.getAttribute('width') === '1' && rect.getAttribute('height') === '1'
    );

    expect(hasCell('7', '0')).toBe(true);
    expect(hasCell('0', '7')).toBe(true);
    expect(hasCell('15', '7')).toBe(true);
    expect(hasCell('7', '15')).toBe(true);
    expect(hasCell('2', '3')).toBe(true);
    expect(hasCell('6', '7')).toBe(true);
    expect(hasCell('9', '9')).toBe(true);
    expect(hasCell('5', '7')).toBe(false);
    expect(hasCell('10', '7')).toBe(false);
    expect(cells.length).toBeGreaterThanOrEqual(50);
  });
});

describe('PixelIllustration', () => {
  it('keeps the current-activity scene on a fine 32px pixel grid', () => {
    render(<PixelIllustration name="life-activity" data-testid="life-activity" />);

    const illustration = screen.getByTestId('life-activity');
    expect(illustration).toHaveClass('il-life-activity');
    expect(illustration).toHaveClass('fine-grid');
    expect(illustration).toHaveAttribute('viewBox', '0 0 32 32');
    expect([...illustration.querySelectorAll('rect')].some((rect) => rect.getAttribute('x') === '24' && rect.getAttribute('y') === '14' && rect.getAttribute('width') === '1')).toBe(true);
    expect(illustration.querySelectorAll('rect').length).toBeGreaterThanOrEqual(70);
  });

  it('keeps the brand mark on a reference-density stepped cat silhouette', () => {
    render(<PixelIllustration name="brand-cat" data-testid="brand-cat" />);

    const illustration = screen.getByTestId('brand-cat');
    expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
    const cells = [...illustration.querySelectorAll('rect')];
    const hasCell = (x: string, y: string, width: string, height: string, fill?: string) => cells.some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height && (!fill || rect.getAttribute('fill') === fill)
    );

    expect(cells.every((rect) => rect.getAttribute('width') === '1' && rect.getAttribute('height') === '1')).toBe(true);
    expect(hasCell('4', '0', '1', '1')).toBe(true);
    expect(hasCell('21', '4', '1', '1')).toBe(true);
    expect(hasCell('0', '12', '1', '1')).toBe(true);
    expect(hasCell('23', '12', '1', '1')).toBe(true);
    expect(hasCell('5', '19', '1', '1')).toBe(true);
    expect(hasCell('19', '19', '1', '1')).toBe(true);
    expect(hasCell('4', '9', '1', '5')).toBe(false);
    expect(cells.some((rect) => rect.getAttribute('fill') === 'var(--il-knock, #090909)')).toBe(false);
    expect(cells.length).toBeGreaterThanOrEqual(150);
  });

  it('keeps the persistent mascot on the open reference portrait grid', () => {
    render(<PixelIllustration name="mascot" data-testid="mascot" />);

    const illustration = screen.getByTestId('mascot');
    expect(illustration).toHaveClass('fine-grid');
    expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
    const hasCell = (x: string, y: string, width: string, height: string) => [...illustration.querySelectorAll('rect')].some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height
    );

    const hasKnockout = (x: string, y: string, width: string, height: string) => [...illustration.querySelectorAll('rect')].some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height && rect.getAttribute('fill') === 'var(--il-knock, #090909)'
    );

    expect(hasCell('8', '1', '8', '1')).toBe(true);
    expect(hasCell('6', '2', '12', '1')).toBe(true);
    expect(hasCell('3', '7', '1', '5')).toBe(true);
    expect(hasCell('20', '7', '1', '5')).toBe(true);
    expect(hasCell('7', '8', '10', '6')).toBe(true);
    expect(hasKnockout('8', '10', '2', '2')).toBe(true);
    expect(hasKnockout('14', '10', '2', '2')).toBe(true);
    expect(hasKnockout('10', '13', '4', '1')).toBe(true);
    expect(hasCell('9', '18', '1', '1')).toBe(true);
    expect(hasCell('8', '17', '8', '1')).toBe(true);
    expect(hasCell('6', '21', '2', '2')).toBe(true);
    expect(illustration.querySelectorAll('rect').length).toBeGreaterThanOrEqual(35);
  });

  it('keeps career and settlement anchors on the same fine grid', () => {
    render(<>
      <PixelIllustration name="job-shop" data-testid="job-shop" />
      <PixelIllustration name="settlement-income" data-testid="settlement-income" />
      <PixelIllustration name="settlement-expense" data-testid="settlement-expense" />
      <PixelIllustration name="settlement-allocation" data-testid="settlement-allocation" />
    </>);

    for (const id of ['job-shop', 'settlement-income', 'settlement-expense', 'settlement-allocation']) {
      const illustration = screen.getByTestId(id);
      expect(illustration).toHaveClass('fine-grid');
      expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
    }
  });

  it('gives mismatched shop devices and footwear their own fine-grid silhouettes', () => {
    render(<>
      <PixelIllustration name="headphones" data-testid="headphones" />
      <PixelIllustration name="tablet" data-testid="tablet" />
      <PixelIllustration name="sneakers" data-testid="sneakers" />
    </>);

    const hasCell = (id: string, x: string, y: string, width: string, height: string) => [...screen.getByTestId(id).querySelectorAll('rect')].some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height
    );

    for (const id of ['headphones', 'tablet', 'sneakers']) {
      const illustration = screen.getByTestId(id);
      expect(illustration).toHaveClass('fine-grid');
      expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
      expect(illustration.querySelectorAll('rect').length).toBeGreaterThanOrEqual(10);
    }

    expect(hasCell('headphones', '3', '11', '4', '7')).toBe(true);
    expect(hasCell('tablet', '4', '4', '1', '16')).toBe(true);
    expect(hasCell('sneakers', '5', '20', '17', '1')).toBe(true);
  });

  it('gives a breakfast voucher a distinct perforated ticket silhouette', () => {
    render(<PixelIllustration name="voucher" data-testid="voucher" />);

    const illustration = screen.getByTestId('voucher');
    const cells = [...illustration.querySelectorAll('rect')];
    const hasCell = (x: string, y: string, width: string, height: string, fill?: string) => cells.some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height && (!fill || rect.getAttribute('fill') === fill)
    );

    expect(illustration).toHaveClass('fine-grid');
    expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
    expect(hasCell('6', '3', '12', '1')).toBe(true);
    expect(hasCell('3', '7', '1', '2', 'var(--il-knock, #090909)')).toBe(true);
    expect(hasCell('20', '7', '1', '2', 'var(--il-knock, #090909)')).toBe(true);
    expect(hasCell('7', '11', '7', '1')).toBe(true);
    expect(cells.length).toBeGreaterThanOrEqual(16);
  });

  it('keeps the primary Shop goods on a dense shared 1-bit illustration tier', () => {
    const goods = ['coffee', 'phone', 'laptop', 'desk', 'hoodie', 'watch', 'record', 'meal', 'film', 'book'] as const;
    render(<>{goods.map((name) => <PixelIllustration name={name} data-testid={`shop-${name}`} key={name} />)}</>);

    for (const name of goods) {
      const illustration = screen.getByTestId(`shop-${name}`);
      expect(illustration).toHaveClass('fine-grid');
      expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
      expect(illustration.querySelectorAll('rect').length).toBeGreaterThanOrEqual(22);
    }
  });

  it('keeps coffee and phone silhouettes open and semantically legible at card scale', () => {
    render(<>
      <PixelIllustration name="coffee" data-testid="shop-coffee-anchors" />
      <PixelIllustration name="phone" data-testid="shop-phone-anchors" />
    </>);

    const hasCell = (id: string, x: string, y: string, width: string, height: string) => [...screen.getByTestId(id).querySelectorAll('rect')].some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height
    );

    expect(hasCell('shop-coffee-anchors', '6', '9', '10', '1')).toBe(true);
    expect(hasCell('shop-coffee-anchors', '4', '18', '16', '1')).toBe(true);
    expect(hasCell('shop-phone-anchors', '7', '3', '1', '18')).toBe(true);
    expect(hasCell('shop-phone-anchors', '16', '3', '1', '18')).toBe(true);
  });

  it('keeps the primary Career vacancy art on the same dense 1-bit tier', () => {
    const jobs = ['job-shop', 'job-office', 'job-manager', 'job-warehouse', 'job-logistics'] as const;
    render(<>{jobs.map((name) => <PixelIllustration name={name} data-testid={name} key={name} />)}</>);

    for (const name of jobs) {
      const illustration = screen.getByTestId(name);
      expect(illustration).toHaveClass('fine-grid');
      expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
      expect(illustration.querySelectorAll('rect').length).toBeGreaterThanOrEqual(22);
    }
  });

  it('keeps settlement ledger people on dense, distinct reference grids', () => {
    render(<>
      <PixelIllustration name="settlement-income" data-testid="settlement-income-bag-test" />
      <PixelIllustration name="settlement-expense" data-testid="settlement-expense-bag-test" />
    </>);

    const cellsFor = (id: string) => new Set([...screen.getByTestId(id).querySelectorAll('rect')].map((rect) => [
      rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height'),
    ].join(',')));

    const income = cellsFor('settlement-income-bag-test');
    const expense = cellsFor('settlement-expense-bag-test');

    expect(income.has('6,1,4,1')).toBe(true);
    expect(income.has('4,12,14,1')).toBe(true);
    expect(income.has('14,19,6,1')).toBe(true);
    expect(expense.has('6,1,2,1')).toBe(true);
    expect(expense.has('5,10,5,1')).toBe(true);
    expect(expense.has('1,16,4,1')).toBe(true);
    expect(income.size).toBeGreaterThanOrEqual(60);
    expect(expense.size).toBeGreaterThanOrEqual(60);
    expect(income).not.toEqual(expense);
  });

  it('keeps the settlement Hero figure readable as a detailed one-bit person with raised hands', () => {
    render(<PixelIllustration name="settlement" data-testid="settlement" />);

    const illustration = screen.getByTestId('settlement');
    const hasCell = (x: string, y: string, width: string, height: string) => [...illustration.querySelectorAll('rect')].some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height
    );
    const hasPaintedCell = (x: string, y: string, width: string, height: string, fill: string) => [...illustration.querySelectorAll('rect')].some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height && rect.getAttribute('fill') === fill
    );
    const hasKnockoutCell = (x: string, y: string, width: string, height: string) => [...illustration.querySelectorAll('rect')].some((rect) =>
      rect.getAttribute('x') === x && rect.getAttribute('y') === y && rect.getAttribute('width') === width && rect.getAttribute('height') === height && rect.getAttribute('fill') === 'var(--il-knock, #090909)'
    );

    expect(illustration).toHaveAttribute('viewBox', '0 0 24 24');
    expect(hasCell('7', '6', '10', '1')).toBe(true);
    expect(hasPaintedCell('8', '8', '8', '5', 'currentColor')).toBe(true);
    expect(hasKnockoutCell('8', '8', '2', '1')).toBe(true);
    expect(hasKnockoutCell('9', '9', '2', '2')).toBe(true);
    expect(hasKnockoutCell('13', '9', '2', '2')).toBe(true);
    expect(hasKnockoutCell('10', '11', '4', '2')).toBe(true);
    expect(hasPaintedCell('7', '7', '10', '8', 'currentColor')).toBe(false);
    expect(hasCell('8', '6', '2', '1')).toBe(true);
    expect(hasCell('5', '8', '1', '1')).toBe(true);
    expect(hasCell('1', '6', '3', '1')).toBe(true);
    expect(hasCell('20', '9', '4', '1')).toBe(true);
    expect(illustration.querySelectorAll('rect').length).toBeGreaterThanOrEqual(45);
    expect(hasCell('1', '7', '3', '3')).toBe(true);
    expect(hasCell('20', '7', '3', '3')).toBe(true);
  });
});
