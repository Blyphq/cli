export interface CommandContext {
  readonly argv: readonly string[];
  readonly cwd: string;
}

export interface CommandDefinition {
  readonly name: string;
  readonly description: string;
  readonly usage?: string;
  readonly aliases?: readonly string[];
  run(context: CommandContext): Promise<void>;
}
