type LogValue = string | number | boolean;

export const logger = {
  info(event: string, fields: Record<string, LogValue> = {}): void {
    console.log(JSON.stringify({ level: "info", event, ...fields }));
  },
  warn(event: string, fields: Record<string, LogValue> = {}): void {
    console.warn(JSON.stringify({ level: "warn", event, ...fields }));
  },
  error(event: string, fields: Record<string, LogValue> = {}): void {
    console.error(JSON.stringify({ level: "error", event, ...fields }));
  },
};
