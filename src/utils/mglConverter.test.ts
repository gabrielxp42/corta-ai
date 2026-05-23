import { describe, expect, it } from 'vitest';
import { MGLConverter } from './mglConverter';

describe('MGLConverter', () => {
  it('gera o mesmo envelope base do FCCommand.dat para um retangulo simples', () => {
    const converter = new MGLConverter(300, 'mm');

    converter.init();
    converter.addRectangle(4, 4, 1185.33, 1637.91);
    converter.finish();

    expect(converter.getOutput()).toBe(
      [
        'IN;',
        'IP0,0,1,1;',
        'ZX1185.20;',
        'PU160.00,160.00;',
        'PD160.00,65676.40;',
        'PD47573.20,65676.40;',
        'PD47573.20,160.00;',
        'PD160.00,160.00;',
        'PU;',
        ';PU63413.20,0.00;'
      ].join('\n')
    );
  });

  it('inclui comandos de condicao quando solicitado', () => {
    const converter = new MGLConverter(300, 'mm');

    converter.init({
      speed: 20,
      pressure: 50,
      includeConditionCommands: true
    });
    converter.addPolyline([
      { x: 0, y: 0 },
      { x: 10, y: 0 }
    ]);
    converter.finish();

    const output = converter.getOutput();

    expect(output).toContain('VS20;');
    expect(output).toContain('FS50;');
  });

  it('fecha circulo aproximado sem duplicar pontos consecutivos', () => {
    const converter = new MGLConverter(300, 'mm');

    converter.init();
    converter.addCircle(100, 100, 20, 12);
    converter.finish();

    const lines = converter.getOutput().split('\n');
    const penDownLines = lines.filter((line) => line.startsWith('PD'));

    expect(lines[3]).toMatch(/^PU/);
    expect(penDownLines.length).toBeGreaterThan(10);
    expect(lines.at(-2)).toBe('PU;');
    expect(lines.at(-1)).toBe(';PU63413.20,0.00;');
  });
});
