# Type-Safe Agents with useChat

- Prefer `ToolLoopAgent` for agent implementations.
- Use `InferAgentUIMessage<typeof agent>` when connecting an agent to `useChat`.
- Follow framework-specific streaming patterns based on the target stack.
