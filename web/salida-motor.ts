export const MARCA_SALIR = 'quakeweb:pide-salir';

export function detectarSalida(linea: string): { salir: boolean; error?: string } {
    const texto = linea.replace(/\^\d/g, '').replace(/^\[\d\d:\d\d:\d\d\]\s*/, '').trim();
    return {
        salir: texto === MARCA_SALIR,
        error: /^ERROR:|\bServer crashed\b|\bUncaught Infinity\b/i.test(texto) ? texto : undefined,
    };
}
