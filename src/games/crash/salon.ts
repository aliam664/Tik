import { CrashSalon } from "./engine";

let shared: CrashSalon | null = null;

/** One live salon for the arena and the ops console. */
export function getSharedSalon(startingBalance = 250): CrashSalon {
  if (!shared) shared = new CrashSalon(startingBalance);
  return shared;
}

export function peekSharedSalon(): CrashSalon | null {
  return shared;
}
