import { describe, expect, it } from 'vitest';
import { MGLConverter } from './mglConverter';

describe('MGLConverter', () => {
  it('gera o mesmo envelope base do FCCommand.dat para um retangulo simples', () => {
    const converter = new MGLConverter(300);

    converter.init();
    converter.addRectangle(4, 4, 1185.33, 1637.91);
    converter.finish();

    expect(converter.getOutput()).toBe(
      [
        'IN;',
        'IP0,0,1,1;',
        'ZX29.63;',
        'PU4.00,4.00;',
        'PD4.00,1641.91;',
        'PD1189.33,1641.91;',
        'PD1189.33,4.00;',
        'PD4.00,4.00;',
        'PU;',
        ';PU1585.33,0.00;'
      ].join('\n')
    );
  });

  it('inclui comandos de condicao quando solicitado', () => {
    const converter = new MGLConverter(300);

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
    const converter = new MGLConverter(300);

    converter.init();
    converter.addCircle(100, 100, 20, 12);
    converter.finish();

    const lines = converter.getOutput().split('\n');
    const penDownLines = lines.filter((line) => line.startsWith('PD'));

    expect(lines[3]).toMatch(/^PU/);
    expect(penDownLines.length).toBeGreaterThan(10);
    expect(lines.at(-2)).toBe('PU;');
    expect(lines.at(-1)).toBe(';PU1585.33,0.00;');
  });
});
