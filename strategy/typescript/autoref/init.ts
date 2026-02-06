/**
 * AutoRef - Árbitro Automático Básico
 * 
 * Implementa detección automática de:
 * - Laterales (balón sale por líneas de banda)
 * - Saques de meta (balón sale por línea de gol)
 * - Doble toque
 * - Goles
 * - Validación de distancias en tiros libres
 */

import "base/base";
import * as World from "base/world";
import * as Referee from "base/referee";
import { Vector, Position } from "base/vector";
import * as pb from "base/protobuf";
import * as vis from "base/vis";
import { log } from "base/amun";
import * as Entrypoints from "base/entrypoints";
import { Coordinates } from "base/coordinates";

// ============================================================================
// CONSTANTES
// ============================================================================

const FIELD_MARGIN = 0.05; // 5cm de margen para detectar salidas
const MIN_DISTANCE_TO_BALL_FREE_KICK = 0.5; // 50cm durante tiros libres
const DOUBLE_TOUCH_TIMEOUT = 0.5; // 0.5 segundos para considerar doble toque
const FREE_KICK_TIMEOUT_DIV_A = 5.0; // 5 segundos en División A
const FREE_KICK_TIMEOUT_DIV_B = 10.0; // 10 segundos en División B

// ============================================================================
// ESTADO DEL AUTOREF
// ============================================================================

interface LastTouchInfo {
    team: "BLUE" | "YELLOW";
    robotId: number;
    position: Position;
    time: number;
}

let lastTouch: LastTouchInfo | undefined;
let freeKickStartTime: number | undefined;
let freeKickTeam: "BLUE" | "YELLOW" | undefined;
let ballPositionAtFreeKick: Position | undefined;

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Determina si estamos en División A o B
 */
function getDivision(): "A" | "B" {
    return World.DIVISION === "A" ? "A" : "B";
}

/**
 * Convierte nuestro equipo a Team de protobuf
 */
function getTeamProto(team: "BLUE" | "YELLOW"): pb.gameController.Team {
    return team === "BLUE" ? pb.gameController.Team.BLUE : pb.gameController.Team.YELLOW;
}

/**
 * Convierte posición a Vector2 de protobuf
 */
function positionToVector2(pos: Position): pb.gameController.Vector2 {
    return {
        x: pos.x,
        y: pos.y
    };
}

/**
 * Envía un evento al Game Controller
 */
function sendGameEvent(event: pb.gameController.GameEvent): void {
    const message: pb.gameController.AutoRefToController = {
        game_event: event
    };

    try {
        amun.sendGameControllerMessage("AutoRefToController", message);
        log(`[AutoRef] Evento enviado: ${event.type}`);
    } catch (e) {
        log(`[AutoRef] Error enviando evento: ${e}`);
    }
}

/**
 * Registra el AutoRef con el Game Controller
 */
function registerAutoRef(): void {
    if (!amun.connectGameController()) {
        log("[AutoRef] No se pudo conectar al Game Controller");
        return;
    }

    const registration: pb.gameController.AutoRefRegistration = {
        identifier: "URUBots-AutoRef-Basic"
    };

    try {
        amun.sendGameControllerMessage("AutoRefRegistration", registration);
        log("[AutoRef] Registrado exitosamente");
    } catch (e) {
        log(`[AutoRef] Error en registro: ${e}`);
    }
}

// ============================================================================
// DETECCIÓN DE EVENTOS
// ============================================================================

/**
 * Actualiza quién tocó la pelota por última vez
 */
function updateLastTouch(): void {
    const ballPos = World.Ball.pos;
    const touchDist = World.Ball.radius + 0.09; // Radio del robot

    // Verificar robots amigos
    for (const robot of World.FriendlyRobots) {
        if (robot.pos.distanceTo(ballPos) <= touchDist) {
            const team = World.TeamIsBlue ? "BLUE" : "YELLOW";
            lastTouch = {
                team: team,
                robotId: robot.id,
                position: new Vector(ballPos.x, ballPos.y),
                time: World.Time
            };
            return;
        }
    }

    // Verificar robots oponentes
    for (const robot of World.OpponentRobots) {
        if (robot.pos.distanceTo(ballPos) <= touchDist) {
            const team = World.TeamIsBlue ? "YELLOW" : "BLUE";
            lastTouch = {
                team: team,
                robotId: robot.id,
                position: new Vector(ballPos.x, ballPos.y),
                time: World.Time
            };
            return;
        }
    }
}

/**
 * Teletransporta el balón a una posición específica en el simulador
 */
function teleportBall(pos: Position): void {
    const command: pb.amun.Command = {
        simulator: {
            ssl_control: {
                teleport_ball: {
                    x: pos.x,
                    y: pos.y,
                    z: 0.02,
                    vx: 0,
                    vy: 0,
                    vz: 0
                }
            }
        }
    };
    try {
        amun.sendCommand(command);
        log(`[AutoRef] Balón teletransportado a: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
    } catch (e) {
        log(`[AutoRef] Error en teleport: ${e}`);
    }
}

/**
 * Detecta si el balón salió del campo
 */
function checkBallLeftField(): void {
    const ballPos = World.Ball.pos;
    const geometry = World.Geometry;

    const fieldWidth = geometry.FieldWidthHalf;
    const fieldHeight = geometry.FieldHeightHalf;

    // Obtener puntos de salida en diferentes formatos
    const crossingPosLocal = new Vector(
        Math.max(-fieldWidth, Math.min(fieldWidth, ballPos.x)),
        Math.max(-fieldHeight, Math.min(fieldHeight, ballPos.y))
    );

    // Coordenadas para el SIMULADOR (Milímetros + Rotación)
    const crossingPosVision = Coordinates.toVision(crossingPosLocal);

    // Verificar si salió por línea de banda (touch line)
    if (Math.abs(ballPos.x) > fieldWidth + FIELD_MARGIN) {
        if (lastTouch) {
            teleportBall(crossingPosVision);
            const event: pb.gameController.GameEvent = {
                type: pb.gameController.GameEvent.Type.BALL_LEFT_FIELD_TOUCH_LINE,
                ball_left_field_touch_line: {
                    by_team: getTeamProto(lastTouch.team),
                    by_bot: lastTouch.robotId,
                    location: positionToVector2(crossingPosLocal)
                }
            };
            sendGameEvent(event);
        }
        return;
    }

    // Verificar si salió por línea de gol (goal line)
    if (Math.abs(ballPos.y) > fieldHeight + FIELD_MARGIN) {
        if (lastTouch) {
            teleportBall(crossingPosVision);
            const event: pb.gameController.GameEvent = {
                type: pb.gameController.GameEvent.Type.BALL_LEFT_FIELD_GOAL_LINE,
                ball_left_field_goal_line: {
                    by_team: getTeamProto(lastTouch.team),
                    by_bot: lastTouch.robotId,
                    location: positionToVector2(crossingPosLocal)
                }
            };
            sendGameEvent(event);
        }
        return;
    }
}

/**
 * Detecta doble toque en tiros libres
 */
function checkDoubleTouchInFreeKick(): void {
    if (!Referee.isFriendlyFreeKickState() && !Referee.isOpponentFreeKickState()) {
        return;
    }

    if (!lastTouch) {
        return;
    }

    // Si el mismo robot tocó dos veces en menos de DOUBLE_TOUCH_TIMEOUT
    const ballPos = World.Ball.pos;
    const touchDist = World.Ball.radius + 0.09;

    const currentTeam = World.TeamIsBlue ? "BLUE" : "YELLOW";

    for (const robot of World.FriendlyRobots) {
        if (robot.pos.distanceTo(ballPos) <= touchDist) {
            if (lastTouch.team === currentTeam &&
                lastTouch.robotId === robot.id &&
                World.Time - lastTouch.time < DOUBLE_TOUCH_TIMEOUT) {

                const event: pb.gameController.GameEvent = {
                    type: pb.gameController.GameEvent.Type.ATTACKER_DOUBLE_TOUCHED_BALL,
                    attacker_double_touched_ball: {
                        by_team: getTeamProto(currentTeam),
                        by_bot: robot.id,
                        location: positionToVector2(lastTouch.position)
                    }
                };
                sendGameEvent(event);
            }
        }
    }

    for (const robot of World.OpponentRobots) {
        if (robot.pos.distanceTo(ballPos) <= touchDist) {
            const oppTeam = World.TeamIsBlue ? "YELLOW" : "BLUE";
            if (lastTouch.team === oppTeam &&
                lastTouch.robotId === robot.id &&
                World.Time - lastTouch.time < DOUBLE_TOUCH_TIMEOUT) {

                const event: pb.gameController.GameEvent = {
                    type: pb.gameController.GameEvent.Type.ATTACKER_DOUBLE_TOUCHED_BALL,
                    attacker_double_touched_ball: {
                        by_team: getTeamProto(oppTeam),
                        by_bot: robot.id,
                        location: positionToVector2(lastTouch.position)
                    }
                };
                sendGameEvent(event);
            }
        }
    }
}

/**
 * Detecta goles
 */
function checkGoal(): void {
    const ballPos = World.Ball.pos;
    const geometry = World.Geometry;

    const goalWidth = geometry.GoalWidth / 2;
    const goalDepth = 0.18; // 18cm de profundidad de la portería

    // Gol en portería azul (y negativo)
    if (ballPos.y < -geometry.FieldHeightHalf - goalDepth &&
        Math.abs(ballPos.x) < goalWidth) {

        if (lastTouch) {
            const event: pb.gameController.GameEvent = {
                type: pb.gameController.GameEvent.Type.POSSIBLE_GOAL,
                possible_goal: {
                    by_team: pb.gameController.Team.YELLOW,
                    kicking_team: getTeamProto(lastTouch.team),
                    kicking_bot: lastTouch.robotId,
                    location: positionToVector2(new Vector(ballPos.x, ballPos.y)),
                    kick_location: positionToVector2(lastTouch.position)
                }
            };
            sendGameEvent(event);
        }
        return;
    }

    // Gol en portería amarilla (y positivo)
    if (ballPos.y > geometry.FieldHeightHalf + goalDepth &&
        Math.abs(ballPos.x) < goalWidth) {

        if (lastTouch) {
            const event: pb.gameController.GameEvent = {
                type: pb.gameController.GameEvent.Type.POSSIBLE_GOAL,
                possible_goal: {
                    by_team: pb.gameController.Team.BLUE,
                    kicking_team: getTeamProto(lastTouch.team),
                    kicking_bot: lastTouch.robotId,
                    location: positionToVector2(new Vector(ballPos.x, ballPos.y)),
                    kick_location: positionToVector2(lastTouch.position)
                }
            };
            sendGameEvent(event);
        }
        return;
    }
}

/**
 * Verifica que los defensores mantengan la distancia en tiros libres
 */
function checkDefenderDistance(): void {
    if (!Referee.isFriendlyFreeKickState() && !Referee.isOpponentFreeKickState()) {
        return;
    }

    const ballPos = World.Ball.pos;

    // Verificar robots oponentes si es nuestro tiro libre
    if (Referee.isFriendlyFreeKickState()) {
        for (const robot of World.OpponentRobots) {
            const distance = robot.pos.distanceTo(ballPos);
            if (distance < MIN_DISTANCE_TO_BALL_FREE_KICK) {
                const oppTeam = World.TeamIsBlue ? "YELLOW" : "BLUE";

                const event: pb.gameController.GameEvent = {
                    type: pb.gameController.GameEvent.Type.DEFENDER_TOO_CLOSE_TO_KICK_POINT,
                    defender_too_close_to_kick_point: {
                        by_team: getTeamProto(oppTeam),
                        by_bot: robot.id,
                        location: positionToVector2(robot.pos),
                        distance: MIN_DISTANCE_TO_BALL_FREE_KICK - distance
                    }
                };
                sendGameEvent(event);
            }
        }
    }

    // Verificar robots amigos si es tiro libre del oponente
    if (Referee.isOpponentFreeKickState()) {
        for (const robot of World.FriendlyRobots) {
            const distance = robot.pos.distanceTo(ballPos);
            if (distance < MIN_DISTANCE_TO_BALL_FREE_KICK) {
                const ourTeam = World.TeamIsBlue ? "BLUE" : "YELLOW";

                const event: pb.gameController.GameEvent = {
                    type: pb.gameController.GameEvent.Type.DEFENDER_TOO_CLOSE_TO_KICK_POINT,
                    defender_too_close_to_kick_point: {
                        by_team: getTeamProto(ourTeam),
                        by_bot: robot.id,
                        location: positionToVector2(robot.pos),
                        distance: MIN_DISTANCE_TO_BALL_FREE_KICK - distance
                    }
                };
                sendGameEvent(event);
            }
        }
    }
}

/**
 * Monitorea el tiempo límite para ejecutar tiros libres
 */
function checkFreeKickTimeout(): void {
    const currentState = World.RefereeState;

    // Iniciar contador cuando comienza un tiro libre
    if (Referee.isFriendlyFreeKickState() || Referee.isOpponentFreeKickState()) {
        if (!freeKickStartTime) {
            freeKickStartTime = World.Time;
            ballPositionAtFreeKick = new Vector(World.Ball.pos.x, World.Ball.pos.y);
            freeKickTeam = Referee.isFriendlyFreeKickState() ?
                (World.TeamIsBlue ? "BLUE" : "YELLOW") :
                (World.TeamIsBlue ? "YELLOW" : "BLUE");
        }

        // Verificar si se movió el balón (tiro ejecutado)
        if (ballPositionAtFreeKick) {
            const ballMoved = World.Ball.pos.distanceTo(ballPositionAtFreeKick) > 0.05;
            if (ballMoved) {
                freeKickStartTime = undefined;
                ballPositionAtFreeKick = undefined;
                return;
            }
        }

        // Verificar timeout
        const timeout = getDivision() === "A" ? FREE_KICK_TIMEOUT_DIV_A : FREE_KICK_TIMEOUT_DIV_B;
        if (freeKickStartTime && World.Time - freeKickStartTime > timeout) {
            // El Game Controller maneja esto automáticamente, solo lo registramos
            log(`[AutoRef] Timeout en tiro libre (${timeout}s)`);
            freeKickStartTime = undefined;
            ballPositionAtFreeKick = undefined;
        }
    } else {
        // Resetear si cambia el estado
        freeKickStartTime = undefined;
        ballPositionAtFreeKick = undefined;
    }
}

// ============================================================================
// VISUALIZACIÓN
// ============================================================================

function visualizeAutoRefStatus(): void {
    if (lastTouch) {
        const team = lastTouch.team === "BLUE" ? "Azul" : "Amarillo";
        vis.addCircle("lastTouch", lastTouch.position, 0.1, vis.colors.pink, false);
        // Mostrar información del último toque
        const info = `Último toque: ${team} #${lastTouch.robotId}`;
        log(info);
    }

    // Visualizar zona de distancia mínima en tiros libres
    if (Referee.isFriendlyFreeKickState() || Referee.isOpponentFreeKickState()) {
        vis.addCircle("freeKickDistance", World.Ball.pos, MIN_DISTANCE_TO_BALL_FREE_KICK,
            vis.colors.yellowHalf, false);
    }
}

// ============================================================================
// LOOP PRINCIPAL
// ============================================================================

function autoRefMain(): boolean {
    // Actualizar tracking de toques
    updateLastTouch();

    // Detectar eventos solo durante el juego
    if (Referee.isGameState()) {
        checkBallLeftField();
        checkGoal();
        checkDoubleTouchInFreeKick();
    }

    // Verificar distancias en tiros libres
    if (Referee.isFriendlyFreeKickState() || Referee.isOpponentFreeKickState()) {
        checkDefenderDistance();
        checkFreeKickTimeout();
    }

    // Visualización
    visualizeAutoRefStatus();

    return true;
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

// Registrar el entrypoint principal
Entrypoints.add("AutoRef", autoRefMain);

// Wrapper function que Ra llama en cada frame
const wrapper = (func: () => boolean) => {
    return () => {
        // Actualizar el estado del mundo
        World.update();

        // Registrar el AutoRef en el primer frame
        if (!World.Time || World.Time < 0.1) {
            registerAutoRef();
            log("[AutoRef] Iniciado - Versión Básica v1.0");
            log(`[AutoRef] División: ${getDivision()}`);
        }

        // Ejecutar el entrypoint seleccionado
        const result = func();

        // Limpiar visualizaciones para el próximo frame
        // (Ra maneja esto automáticamente)

        return result;
    };
};

// Exportar la estrategia para Ra
export const scriptInfo = {
    name: "AutoRef URUBots",
    entrypoints: Entrypoints.get(wrapper)
};
