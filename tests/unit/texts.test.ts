import {describe, expect, it} from 'vitest';
import {catalogsForTests, fill, languageFor, numberFormat, stringsFor} from '../../src/i18n';

type Tree = {[key: string]: string | string[] | Tree};

/** Every text, by its path: "zones.forest.banner.0". */
function texts(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else if (Array.isArray(value)) value.forEach((v, i) => out.set(`${path}.${i}`, v));
    else for (const [k, v] of texts(value, path)) out.set(k, v);
  }
  return out;
}

describe('texts', () => {
  const en = texts(catalogsForTests.en as unknown as Tree);
  const pt = texts(catalogsForTests.pt as unknown as Tree);

  it('have the same keys and placeholders in English and Portuguese', () => {
    expect([...pt.keys()].sort()).toEqual([...en.keys()].sort());
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [key, value] of en) expect(holes(pt.get(key)!), key).toBe(holes(value));
    for (const [key, value] of en) expect(value.length > 0, key).toBe(pt.get(key)!.length > 0);
  });

  it('use Brazilian Portuguese for any pt-*', () => {
    expect(languageFor('pt-PT')).toBe('pt');
    expect(languageFor('pt-BR')).toBe('pt');
    expect(languageFor('fr-FR')).toBe('en');
    expect(languageFor(undefined)).toBe('en');
    expect(stringsFor('pt-PT').play).toBe(catalogsForTests.pt.play);
    expect(stringsFor('de').play).toBe(catalogsForTests.en.play);
    for (const value of pt.values()) {
      expect(value).not.toMatch(/\b(Salta|salta|A sua|a sua|O seu|o seu|tu|teu|tua|ecrã|Ecrã|carregue|Carregue)\b/);
    }
    expect(pt.get('tagline')).toContain('VOCÊ');
  });

  it('format numbers and fill placeholders', () => {
    expect(numberFormat('en')(1842)).toBe('1,842');
    expect(numberFormat('pt-PT')(1842)).toBe('1.842');
    expect(fill('{a} m · {b}', {a: '1,436', b: 'Snow'})).toBe('1,436 m · Snow');
    expect(fill('{missing}', {})).toBe('{missing}');
  });
});
