# Reconocimiento facial — arquitectura

## Fase 1 (actual): referencia única

```
Upload / Selfie → normalize → DetectFaces (ALL attrs)
  → 0 caras: error
  → 1 cara: assessReferenceFaceQuality → high | medium | low
  → N caras: pending detection → usuario elige → assess → high | medium | low
  → referenceToken + faceBox + qualityTier (15 min TTL)
```

### Niveles de calidad

| Tier | Significado | UX |
|------|-------------|-----|
| **high** | Referencia ideal para búsqueda | Continuar sin advertencia |
| **medium** | Usable, menor precisión esperada | Continuar + advertencia |
| **low** | No sirve para matching confiable | Bloquear + motivo específico |

Criterios en `faceQuality.ts` (confidence, área del bbox, sharpness/brightness, pose, oclusión, ojos).

**Nota:** en fotos grupales la cara elegida suele ocupar ~1–3% del frame. El umbral anterior (5%) rechazaba casi todas. Los umbrales actuales separan “cara lejana pero usable” (medium) de “punto ilegible” (low).

## Fase 2A (actual): CompareFaces trial

- `POST /api/recognize/compare-album` — compara referencia vs hasta 50 fotos
- `CompareFaces` con umbral 85, sin colecciones ni caché
- Provider-agnostic via `albumImageFetcher.ts` (JPEG, HEIC convertido)

## Fase 2B (próxima): búsqueda en álbum a escala

- `IndexFaces` + `SearchFacesByImage` por imagen de álbum
- Umbral similitud 85, colección TTL 30 días, async ≥500 fotos
- La referencia debe ser **mejor** que las fotos objetivo típicas; por eso medium acepta con advertencia pero low bloquea

## Extensión futura: perfil facial guiado (no Face ID)

**Modo “Crear perfil facial mejorado”** — captura guiada con cámara:

1. Mirá al frente
2. Girá levemente a la izquierda / derecha
3. Mirá levemente hacia arriba
4. Expresión neutra o sonrisa

La app captura frames automáticamente cuando la calidad supera un umbral por pose.

### Modelo de datos propuesto

```typescript
interface FacialProfile {
  profileId: string
  userId?: string
  references: StoredReference[]  // múltiples tokens, distintos yaw/pitch
  createdAt: number
}
```

### Búsqueda con múltiples referencias (Fase 3+)

- `SearchFacesByImage` con cada referencia del perfil
- Unir resultados por `imageId` (max similarity)
- Mejor recall en álbumes con ángulos variados

### Preparación en código actual

- `ReferenceSource`: ya incluye `'profile'` (reservado)
- `referenceStore`: un token = una referencia; extender a `saveReferenceSet()`
- `faceQuality.ts`: reutilizable por pose en captura guiada
- `qualityTier`: persistido en referencia para telemetría / UX

No es biometría de seguridad (2D, cámara web). Objetivo: más embeddings visuales para encontrar fotos en álbumes.
