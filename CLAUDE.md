# Director

App de escritorio que convierte una idea más referencias visuales en un prompt de **MiniMax H3** estructurado y validado.

## Fuentes de verdad

- `docs/MiniMax_H3_Prompting_Guide_ES.md` — las reglas del formato H3. Cualquier cambio en el motor de prompts debe citar la sección de la guía que lo justifica (`§12.1`, `§45`, …).
- `docs/AGENTS_multimedia_tauri.md` — el stack permitido y las reglas de dependencias. Antes de agregar una librería, verificá que la guía la contemple y que ninguna existente ya resuelva el problema.

## Comandos

```bash
pnpm tauri dev
```

```bash
pnpm test
```

```bash
pnpm typecheck
```

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

## Reglas de arquitectura

1. **La estructura la impone TypeScript, no el modelo.** El LLM devuelve JSON con prosa (`summary`, `styleSentence`, `shots[]`, `soundscape`, `music`). Lo demás lo emite `src/core/h3/render.ts`: las seis secciones, la numeración de referencias, los headers `[Shot N]`, los timestamps, todas las líneas de diálogo, las frases de uso de frames (§5) y los bloques de restricción — composición por aspect ratio (§43–§44), identidad/vestuario/duplicados (§32–§34), logos y pantallas suministradas (§35, §40), y texto y números visibles (§19–§21). Son exactamente los fallos que la guía dice que los modelos producen solos, así que no se le piden al modelo: se imponen.

   Corolario: **ninguna referencia cargada puede desaparecer del prompt.** Un rol de Subject solo llega a la salida a través de un Subject (§5.1), así que el store crea uno al agregar el archivo y `effectiveSubjects()` deriva otro si nada lo reclama. `reference.notCited` falla si aun así queda fuera.
2. **Ninguna API key llega al webview.** Se guardan en el Administrador de credenciales de Windows (`src-tauri/src/secrets.rs`) y todas las llamadas HTTP salen de Rust. El frontend solo recibe un booleano `hasKey`.
3. **Los archivos originales tampoco llegan al webview.** Rust genera miniaturas y previews acotadas y devuelve data URLs (`src-tauri/src/media.rs`). No se habilita el asset protocol ni un scope de filesystem.
4. **Todo prompt se valida antes de mostrarse.** `src/core/h3/validate.ts` es el checklist de la §45 hecho ejecutable. Si agregás una regla al renderer, agregá el test que la rompe.
5. **El renderer no puede depender del idioma de la UI.** La UI está en español; el prompt generado va en inglés salvo diálogo, letras y texto en pantalla (§2).

## Mapa del código

| Ruta | Qué hace |
|---|---|
| `src/core/h3/render.ts` | Ensamblado determinista de las secciones |
| `src/core/h3/validate.ts` | Checklist §45 ejecutable |
| `src/core/h3/assemble.ts` | Brief para el modelo escritor y parseo tolerante del JSON |
| `src/core/h3/multiWindow.ts` | Generador Maestro (§30–31) |
| `src/core/h3/plan.ts` | Planificación de shots según §12.3 |
| `src/core/h3/systemPrompt.ts` | §47 literal + contrato de salida |
| `src/core/h3/roles.ts` | Roles, retenciones, numeración y detección de modo |
| `src-tauri/src/llm/client.rs` | HTTP, streaming SSE, cancelación |
| `src-tauri/src/db.rs` | SQLite: proyectos, historial, caché de visión |

## Pruebas

Los tests del motor corren sin red. `src/core/h3/pipeline.e2e.test.ts` sí pega contra un endpoint real y **se saltea solo** si no hay nada escuchando:

```bash
H3_TEST_ENDPOINT=http://127.0.0.1:1234/v1 H3_TEST_MODEL=mi-modelo pnpm test
```

Agregá `H3_PRINT=1` para que imprima el prompt generado.
