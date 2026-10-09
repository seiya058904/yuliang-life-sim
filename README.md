<h1 align="center">🕹️ YULIANG · LIFE SIM</h1>

<p align="center">
  <strong>Plan a week. Live with the consequences.</strong>
</p>

<p align="center">
  An open-ended life simulation presented as a monochrome pixel console.<br>
  Make your plans, let time move, and decide what matters when life interrupts.
</p>

<p align="center">
  <a href="https://seiya058904.github.io/yuliang-life-sim/"><strong>▶ Play in Your Browser</strong></a>
  &nbsp;·&nbsp;
  <a href="#the-weekly-loop">🗓️ The Life Loop</a>
  &nbsp;·&nbsp;
  <a href="#inside-the-simulation">▦ Explore the Systems</a>
  &nbsp;·&nbsp;
  <a href="#start-playing">⚙️ Run Locally</a>
</p>

<p align="center">
  <sub>《余量》 — ORIGINAL TITLE &nbsp;·&nbsp; WEEKLY PLANNING &nbsp;·&nbsp; PLAYER-LED DECISIONS &nbsp;·&nbsp; PIXEL CONSOLE</sub>
</p>

<p align="center">
  <img width="750" alt="Yuliang Life Sim — original monochrome pixel-console project artwork" src="https://github.com/user-attachments/assets/f4bd2de9-fc86-4538-a7d7-e1716ea171d4" />
</p>

---

> **Life isn't a score to maximize.**
>
> There is no prescribed career, fortune, or perfect ending to chase. You choose how to spend your time. The simulation handles what follows—and returns control when a decision is yours to make.

<a id="the-weekly-loop"></a>
## 🗓️ The Weekly Loop

<p align="center"><code>PLAN THE WEEK &nbsp;→&nbsp; LET TIME RUN &nbsp;→&nbsp; MAKE A DECISION &nbsp;→&nbsp; CONTINUE</code></p>

1. **Plan.** Arrange activities and commitments around the time, money, and opportunities available to you.
2. **Advance.** Start the week and watch the world progress through work, daily routines, expenses, and changing circumstances.
3. **Decide.** When an event, job offer, or settlement requires your attention, the simulation stops for your choice.
4. **Live with the result.** Review what changed, adjust your plans, and move into another week.

Browsing the game's pages **does not consume simulated time**. Time advances when you choose to run the simulation; it does not make important choices on your behalf.

<a id="inside-the-simulation"></a>
## ▦ Inside the Simulation

The game connects several parts of life without turning them into a single success meter.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🕰️ Life & Time</h3>
      <p><sub>ROUTINE · SCHEDULING · CONSEQUENCES</sub></p>
      <p>Arrange your week, track your current activity, and balance the things you want to do against the time you actually have.</p>
    </td>
    <td width="50%" valign="top">
      <h3>💼 Work & Career</h3>
      <p><sub>JOBS · OPPORTUNITIES · DEVELOPMENT</sub></p>
      <p>Explore work, applications, offers, study, and the longer-term consequences of career decisions.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>💰 Money & Wealth</h3>
      <p><sub>INCOME · EXPENSES · INVESTMENTS</sub></p>
      <p>Manage everyday finances and longer-term assets. Cash flow, invested capital, realized gains, and changing valuations have different meanings.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🤝 People & Relationships</h3>
      <p><sub>INTERACTIONS · CONNECTIONS · EVENTS</sub></p>
      <p>Make room for the people in your life, respond to encounters, and see how choices can carry forward.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🏙️ City & Daily Living</h3>
      <p><sub>PLACES · HOUSING · EVERYDAY CHOICES</sub></p>
      <p>Interact with the city, explore living arrangements, and make decisions that affect your day-to-day options.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🛍️ Shop & Possessions</h3>
      <p><sub>PURCHASES · INVENTORY · TRADE-OFFS</sub></p>
      <p>Choose what is worth buying, consider the cost, and let owned items affect play through the game's actual rules.</p>
    </td>
  </tr>
</table>

## ◼ A Life, Rendered in Black and White

Yuliang's visual identity is deliberately restrained: **hard-edged panels, compact information, high-contrast states, and pixel-inspired geometry**. It aims to feel like a game console for an evolving life—not a business dashboard.

- **Information before decoration.** Dates, activities, money, conditions, and outcomes come from the actual simulation state.
- **Decisions remain visible.** Events and monthly summaries are meaningful pauses, not background notifications to dismiss automatically.
- **No morality meter.** A career path or financial outcome is a consequence, not a judgment of how well someone lived.
- **Readable by design.** Keyboard focus, accessible contrast, and reduced-motion behavior remain part of the interface.

The interface is **desktop- and landscape-first**. Narrower devices reuse the same core experience rather than a separate portrait-only game.

<a id="start-playing"></a>
## 🚀 Play or Run Locally

### 🌐 Play online

**[Open Yuliang Life Sim →](https://seiya058904.github.io/yuliang-life-sim/)**

The hosted version is published through the repository's GitHub Pages workflow. The game interface remains in Chinese; this README is written in English for repository visitors.

> [!NOTE]
> **Your progress lives in your browser.** The canonical save uses IndexedDB with transaction-based conflict checks and recovery behavior. Clearing site data or using a different browser/origin can leave you without the same saved game. Treat browser storage as local—not as a cloud account.

### 💻 Local development

Use Node.js and the committed npm lockfile. From the repository root:

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

Open **http://127.0.0.1:4173/**. Local development and the GitHub Pages site use different browser origins and do not automatically share a save.

<a id="for-developers"></a>
## ⚙️ Under the Hood

**React · TypeScript · Vite · Zustand**, with simulation rules kept separate from the interface and the save layer.

<details>
<summary><strong>🛠️ Expand verification and repository architecture</strong></summary>

### Verification

Run these commands from the repository root:

```bash
npm run content:validate   # Authored-content contracts
npm run content:simulate   # Deterministic simulation checks
npm test                   # Vitest regression suite
npm run build              # Content validation, TypeScript, Vite build
npm run e2e                # Playwright browser tests
```

Browser tests require the appropriate Playwright browser setup. The GitHub Actions Pages workflow uses Node.js 22, builds for the `/yuliang-life-sim/` base path, and runs selected desktop browser acceptance checks before deployment.

### Repository map

```text
src/game/engine/       Simulation, time advancement, and rules
src/game/store/        Zustand integration and save/recovery logic
src/game/content/      Authored content, contracts, and validation
src/game/ui/           Life, career, city, shop, wealth, and social views
scripts/               Content checks, simulations, and UI tooling
e2e/                   Browser acceptance scenarios
PRODUCT.md             Product intent and boundaries
DESIGN.md              Monochrome visual and interaction system
AGENTS.md              Repository rules for AI-assisted engineering
```

The engine must preserve player-controlled decisions, distinct financial accounting semantics, authored-content contracts, and compatibility with existing saves. Visual changes alone do not justify rewriting those systems.

</details>

## 📚 Project Notes

- **[Product vision](PRODUCT.md)** — the open-ended life simulation and what it deliberately avoids.
- **[Visual system](DESIGN.md)** — the black-and-white pixel console, type hierarchy, states, and accessibility rules.
- **[Repository guidance](AGENTS.md)** — canonical source paths, testing expectations, and save-safety boundaries.
- **[Development notes](docs/)** — content guidance, implementation records, and historical reviews.

---

<p align="center">
  <sub>YOUR WEEK. YOUR CHOICES. THE WORLD KEEPS MOVING.</sub><br>
  <sub>《余量》 · A life simulation without a single correct way to live.</sub>
</p>
