# AutoRef - Árbitro Automático

## Descripción

Este AutoRef implementa detección automática de eventos del juego según las reglas de la RoboCup SSL.

## Funcionalidades Implementadas

### ✅ 1. Laterales (Touch Line)
- Detecta cuando el balón sale por las líneas de banda
- Envía evento `BALL_LEFT_FIELD_TOUCH_LINE` al Game Controller
- Identifica el equipo y robot que tocó el balón por última vez

### ✅ 2. Saques de Meta (Goal Line)
- Detecta cuando el balón sale por las líneas de gol (sin ser gol)
- Envía evento `BALL_LEFT_FIELD_GOAL_LINE` al Game Controller
- El GC decide si es saque de esquina o saque de meta

### ✅ 3. Detección de Goles
- Detecta cuando el balón entra completamente en la portería
- Envía evento `POSSIBLE_GOAL` al Game Controller
- El GC valida y confirma el gol

### ✅ 4. Doble Toque
- Detecta cuando un robot toca el balón dos veces seguidas en un tiro libre
- Envía evento `ATTACKER_DOUBLE_TOUCHED_BALL`
- Timeout configurable: 0.5 segundos

### ✅ 5. Validación de Distancias en Tiros Libres
- Verifica que los defensores mantengan 0.5m de distancia del balón
- Envía evento `DEFENDER_TOO_CLOSE_TO_KICK_POINT`
- Aplica tanto para tiros libres amigos como oponentes

### ✅ 6. Tiempo Límite en Tiros Libres
- Monitorea el tiempo para ejecutar tiros libres
- División A: 5 segundos
- División B: 10 segundos
- El Game Controller maneja la sanción automáticamente

## Cómo Usar

### 1. Compilar el TypeScript

```bash
cd /root/framework/strategy/typescript
npm install
npm run build
```

### 2. Cargar el AutoRef en Ra

1. Abre la interfaz de Ra
2. Ve a la sección de **AutoRef** (tercera estrategia)
3. Carga el archivo: `strategy/typescript/autoref/init.ts`
4. Entry point: **AutoRef**
5. Asegúrate de que el **Internal Game Controller** esté habilitado

### 3. Habilitar el AutoRef

En la interfaz de Ra, asegúrate de que:
- ☑️ **Use Internal Referee** esté activado
- ☑️ **Use Internal AutoRef** esté activado

## Configuración

### Constantes Ajustables

En `autoref-init.ts` puedes modificar:

```typescript
const FIELD_MARGIN = 0.05;                    // Margen para detectar salidas (5cm)
const MIN_DISTANCE_TO_BALL_FREE_KICK = 0.5;  // Distancia mínima en tiros libres (50cm)
const DOUBLE_TOUCH_TIMEOUT = 0.5;             // Tiempo para considerar doble toque (0.5s)
const FREE_KICK_TIMEOUT_DIV_A = 5.0;          // Timeout División A (5s)
const FREE_KICK_TIMEOUT_DIV_B = 10.0;         // Timeout División B (10s)
```

## Arquitectura

```
┌─────────────────┐
│   AutoRef.ts    │ ← Detecta eventos
└────────┬────────┘
         │ sendGameEvent()
         ↓
┌─────────────────────────┐
│ Internal Game Controller│ ← Procesa eventos
└────────┬────────────────┘
         │ Envía comandos SSL_Referee
         ↓
┌─────────────────┐
│   Simulador     │ ← Ejecuta comandos
└─────────────────┘
```

## Eventos Detectados

| Evento | Tipo | Descripción |
|--------|------|-------------|
| Lateral | `BALL_LEFT_FIELD_TOUCH_LINE` | Balón sale por línea de banda |
| Saque de meta/esquina | `BALL_LEFT_FIELD_GOAL_LINE` | Balón sale por línea de gol |
| Gol | `POSSIBLE_GOAL` | Balón entra en portería |
| Doble toque | `ATTACKER_DOUBLE_TOUCHED_BALL` | Robot toca dos veces seguidas |
| Distancia incorrecta | `DEFENDER_TOO_CLOSE_TO_KICK_POINT` | Defensor muy cerca del balón |

## Próximas Mejoras

### Eventos Pendientes de Implementar:
- [ ] `BOT_TOO_FAST_IN_STOP` - Robot muy rápido durante Stop
- [ ] `DEFENDER_IN_DEFENSE_AREA` - Defensor en área propia
- [ ] `ATTACKER_TOO_CLOSE_TO_DEFENSE_AREA` - Atacante muy cerca del área
- [ ] `BOT_DRIBBLED_BALL_TOO_FAR` - Robot dribblea demasiado lejos
- [ ] `BOT_KICKED_BALL_TOO_FAST` - Disparo demasiado rápido
- [ ] `BOT_CRASH_UNIQUE` - Colisión entre robots
- [ ] `KEEPER_HELD_BALL` - Portero retiene el balón demasiado tiempo

## Debugging

El AutoRef registra eventos en el log de Ra:

```
[AutoRef] Iniciado - Versión Básica v1.0
[AutoRef] División: A
[AutoRef] Evento enviado: BALL_LEFT_FIELD_TOUCH_LINE
[AutoRef] Timeout en tiro libre (5s)
```

## Notas Importantes

1. **El AutoRef NO toma decisiones finales** - Solo detecta eventos y los envía al Game Controller
2. **El Game Controller valida y ejecuta** - Puede aceptar o rechazar eventos
3. **Requiere Internal Game Controller activo** - Sin él, los eventos no se procesarán
4. **Compatible con División A y B** - Ajusta timeouts automáticamente

## Troubleshooting

### El AutoRef no envía eventos
- ✓ Verifica que el Internal Game Controller esté corriendo
- ✓ Revisa los logs en Ra para ver errores de conexión
- ✓ Asegúrate de que "Use Internal AutoRef" esté habilitado

### Los eventos se envían pero no se ejecutan
- ✓ El Game Controller puede estar rechazando eventos inválidos
- ✓ Verifica que los campos requeridos estén completos
- ✓ Revisa los logs del Game Controller

### Falsos positivos
- ✓ Ajusta `FIELD_MARGIN` si detecta salidas incorrectas
- ✓ Modifica `DOUBLE_TOUCH_TIMEOUT` si hay muchos falsos dobles toques
- ✓ Revisa la calibración del tracking de visión

## Contacto

Para reportar bugs o sugerir mejoras, contacta al equipo de desarrollo.
