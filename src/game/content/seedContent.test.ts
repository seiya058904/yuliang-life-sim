import { describe, expect, it } from 'vitest';
import { contentRegistry } from './registry';
import { validateContent } from './validateContent';
import { composeContentRegistry } from './registry';

describe('seed content registry', () => {
  it('is valid and can run as the default content pack', () => {
    expect(validateContent(contentRegistry)).toEqual({ valid: true, errors: [] });
  });

  it('exposes official lifestyle activities from the content registry', () => {
    expect(contentRegistry.activities?.filter((activity) => activity.contentStatus === 'official').map((activity) => activity.id)).toEqual([
      'activity.casual-meal',
      'activity.cinema',
      'activity.cafe-break',
      'activity.riverside-night-market',
      'activity.industrial-design-exhibition',
      'activity.weekend-getaway',
      'activity.old-town-culture',
      'activity.browse-bookstore',
      'activity.city-photography',
      'activity.brand-film-project',
    ]);
  });

  it('exposes official services with repeat-use cooldown metadata', () => {
    expect(contentRegistry.services?.filter((service) => service.contentStatus === 'official')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'service.haircut-basic', cooldownDays: 14 }),
      expect.objectContaining({ id: 'service.laundry', cooldownDays: 7 }),
      expect.objectContaining({ id: 'service.fitness-assessment', cooldownDays: 60 }),
      expect.objectContaining({ id: 'service.nutrition-coaching', cooldownDays: 45, price: 160 }),
      expect.objectContaining({ id: 'service.workday-meal', cooldownDays: 3, price: 42 }),
    ]));
  });

  it('exposes official character-specific interactions from the content registry', () => {
    expect(contentRegistry.relationshipInteractions?.filter((interaction) => interaction.contentStatus === 'official').map((interaction) => interaction.id)).toEqual([
      'interaction.coffee-with-recruiter',
      'interaction.tech-coffee',
      'interaction.dinner-with-agent',
      'interaction.business-with-zhou',
    ]);
  });

  it('exposes official investment products from the content registry', () => {
    expect(contentRegistry.investments?.filter((investment) => investment.contentStatus === 'official').map((investment) => investment.id)).toEqual([
      'investment.flexible-savings',
      'investment.broad-market-index',
      'investment.technology-growth',
      'investment.commercial-reit',
      'investment.qiming-equity',
      'investment.citylife-private-equity',
    ]);
  });

  it('exposes official vehicle assets from the content registry', () => {
    expect(contentRegistry.assets.filter((asset) => asset.contentStatus === 'official' && asset.kind === 'vehicle').map((asset) => asset.id)).toEqual([
      'asset.used-compact',
      'asset.city-sedan',
      'asset.city-ev',
      'asset.quality-sedan',
      'asset.city-suv',
      'asset.executive-sedan',
    ]);
  });

  it('populates distinct quality, SUV, and executive vehicle tiers for the same reachable asset loop', () => {
    expect(contentRegistry.assets.filter((asset) => asset.kind === 'vehicle' && asset.contentStatus === 'official')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'asset.quality-sedan', price: 236000, monthlyCost: 980, depreciationRate: 0.005 }),
      expect.objectContaining({ id: 'asset.city-suv', price: 318000, monthlyCost: 1380, depreciationRate: 0.006 }),
      expect.objectContaining({ id: 'asset.executive-sedan', price: 520000, monthlyCost: 2200, depreciationRate: 0.007 }),
    ]));
  });

  it('exposes official courses from the content registry', () => {
    expect(contentRegistry.courses?.filter((course) => course.contentStatus === 'official').map((course) => course.id)).toEqual([
      'course.workplace-basics',
      'course.office-tools',
      'course.data-analysis-basics',
      'course.people-management',
    ]);
  });

  it('exposes the first official expert and management career routes', () => {
    expect(contentRegistry.jobs.filter((job) => job.contentStatus === 'official' && ['job.category-operations-expert', 'job.regional-operations-manager'].includes(job.id)).map((job) => job.id)).toEqual([
      'job.regional-operations-manager',
      'job.category-operations-expert',
    ]);
    expect(contentRegistry.vacancyTemplates?.filter((vacancy) => ['job.category-operations-expert', 'job.regional-operations-manager'].includes(vacancy.jobId)).map((vacancy) => vacancy.jobId)).toEqual([
      'job.regional-operations-manager',
      'job.category-operations-expert',
    ]);
  });

  it('exposes a reachable logistics company route from entry work to coordination', () => {
    expect(contentRegistry.companies?.find((company) => company.id === 'company.huanliu')).toMatchObject({
      name: '环流物流', locationId: 'location.industrial', jobIds: expect.arrayContaining(['job.huanliu-warehouse-assistant', 'job.huanliu-dispatch-coordinator']),
    });
    expect(contentRegistry.jobs.filter((job) => ['job.huanliu-warehouse-assistant', 'job.huanliu-dispatch-coordinator'].includes(job.id))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'job.huanliu-warehouse-assistant', experienceTags: ['logistics'] }),
      expect.objectContaining({ id: 'job.huanliu-dispatch-coordinator', experienceRequired: { logistics: 22 } }),
    ]));
    expect(contentRegistry.vacancyTemplates?.filter((vacancy) => vacancy.companyId === 'company.huanliu').map((vacancy) => vacancy.jobId)).toEqual([
      'job.huanliu-warehouse-assistant',
      'job.huanliu-dispatch-coordinator',
    ]);
  });

  it('exposes the official education company route and its public vacancies', () => {
    expect(contentRegistry.companies?.find((company) => company.id === 'company.greenfield-education')).toMatchObject({
      name: '青禾教育科技', locationId: 'location.central', jobIds: expect.arrayContaining(['job.course-operations-assistant', 'job.learning-consultant', 'job.course-operations-specialist', 'job.course-teaching-assistant']),
    });
    expect(contentRegistry.vacancyTemplates?.filter((vacancy) => vacancy.companyId === 'company.greenfield-education').map((vacancy) => vacancy.jobId)).toEqual([
      'job.course-operations-assistant', 'job.learning-consultant', 'job.course-operations-specialist', 'job.course-teaching-assistant',
    ]);
  });

  it('exposes the first consulting career route with stable company and vacancy IDs', () => {
    expect(contentRegistry.companies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'company.clearview-consulting', jobIds: expect.arrayContaining(['job.research-assistant', 'job.business-analysis-assistant', 'job.business-analyst']) }),
    ]));
    expect(contentRegistry.vacancyTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'vacancy-template.research-clearview', jobId: 'job.research-assistant', companyId: 'company.clearview-consulting' }),
      expect.objectContaining({ id: 'vacancy-template.analysis-assistant-clearview', jobId: 'job.business-analysis-assistant', companyId: 'company.clearview-consulting' }),
      expect.objectContaining({ id: 'vacancy-template.analyst-clearview', jobId: 'job.business-analyst', companyId: 'company.clearview-consulting' }),
    ]));
  });

  it('exposes the first travel career route with a reachable public vacancy', () => {
    expect(contentRegistry.companies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'company.harbor-travel', name: '栖岸文旅', jobIds: ['job.travel-product-assistant'] }),
    ]));
    expect(contentRegistry.vacancyTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'vacancy-template.travel-assistant-harbor', jobId: 'job.travel-product-assistant', companyId: 'company.harbor-travel' }),
    ]));
  });

  it('exposes the low-barrier ecommerce operations route with a progression ladder', () => {
    expect(contentRegistry.companies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'company.starbridge-ecommerce', name: '星桥电商', jobIds: expect.arrayContaining(['job.order-operations-assistant', 'job.ecommerce-operations-assistant', 'job.ecommerce-operations-specialist', 'job.growth-operations']) }),
    ]));
    expect(contentRegistry.vacancyTemplates?.filter((vacancy) => vacancy.companyId === 'company.starbridge-ecommerce').map((vacancy) => vacancy.jobId)).toEqual([
      'job.order-operations-assistant', 'job.ecommerce-operations-assistant', 'job.ecommerce-operations-specialist', 'job.growth-operations',
    ]);
  });

  it('exposes the official headhunter contact and its opportunity-bearing choice', () => {
    expect(contentRegistry.characters.find((character) => character.id === 'character.xuheng')).toMatchObject({ identity: '资深招聘顾问 / 猎头' });
    expect(contentRegistry.events.find((event) => event.id === 'event.headhunter-contact')?.choices[0]).toMatchObject({
      opportunity: { jobId: 'job.category-operations-expert', route: 'headhunter', source: '许衡主动联系' },
    });
    expect(contentRegistry.events.find((event) => event.id === 'event.headhunter-contact')?.conditions).toMatchObject({
      conditions: expect.arrayContaining([{ type: 'current_salary_at_least', amount: 9000 }]),
    });
  });

  it('exposes the official city development event with a real location effect', () => {
    const event = contentRegistry.events.find((entry) => entry.id === 'event.city-transit-upgrade');
    expect(event?.choices.find((choice) => choice.id === 'support')?.effects).toContainEqual({ type: 'location_development', locationId: 'location.riverside', amount: 1 });
  });

  it('exposes the official industrial district development event with a real location effect', () => {
    const event = contentRegistry.events.find((entry) => entry.id === 'event.industrial-hub-upgrade');
    expect(event?.contentStatus).toBe('official');
    expect(event?.choices.find((choice) => choice.id === 'support')?.effects).toContainEqual({ type: 'location_development', locationId: 'location.industrial', amount: 1 });
  });

  it('exposes a gated high-value collectible asset through the investment entry event', () => {
    expect(contentRegistry.assets.find((asset) => asset.id === 'asset.vintage-watch')).toMatchObject({ kind: 'collectible', price: 18000, requirements: { type: 'has_capability', capability: 'market_insight' } });
    const event = contentRegistry.events.find((entry) => entry.id === 'event.investment-note');
    expect(event?.choices.every((choice) => choice.effects.some((effect) => effect.type === 'unlock_asset' && effect.assetId === 'asset.vintage-watch'))).toBe(true);
  });

  it('exposes a company expansion event that creates an internal career opportunity', () => {
    const event = contentRegistry.events.find((entry) => entry.id === 'event.xinghe-expansion');
    expect(event?.choices.find((choice) => choice.id === 'join-project')?.opportunity).toMatchObject({
      jobId: 'job.independent-consultant', companyId: 'company.xinghe', route: 'internal', source: '星河科技业务扩展',
    });
  });

  it('exposes the official relationship storyline from the content registry', () => {
    expect(contentRegistry.storylines?.filter((storyline) => storyline.contentStatus === 'official').map((storyline) => storyline.id)).toEqual([
      'storyline.remote-connection',
    ]);
    expect(contentRegistry.dialogues?.filter((dialogue) => dialogue.contentStatus === 'official').map((dialogue) => dialogue.id)).toEqual([
      'dialogue.remote-connection',
    ]);
  });

  it('exposes official venues that bind to real locations and activities', () => {
    expect(contentRegistry.venues?.filter((venue) => venue.contentStatus === 'official')).toHaveLength(5);
    expect(contentRegistry.venues?.every((venue) => venue.activityIds.every((id) => contentRegistry.activities?.some((activity) => activity.id === id)))).toBe(true);
  });

  it('supports replacing one category while keeping the remaining Seed categories', () => {
    const result = composeContentRegistry({ jobs: [{ ...contentRegistry.jobs[0], id: 'job.seed-shop-clerk', contentStatus: 'official', name: '正式示例工作' }] });
    expect(result.jobs[0].id).toBe('job.seed-shop-clerk');
    expect(result.items[0].contentStatus).toBe('seed');
    expect(validateContent(result).valid).toBe(true);
  });
});
