/**
 * Handles when a user opens the Assistant container.
 */
export const assistantThreadStarted = async ({ event, logger, say, setSuggestedPrompts, saveThreadContext }) => {
  const { context } = event.assistant_thread;

  try {
    await say('Hey! I can connect you to any PSA agent. Just ask.');
    await saveThreadContext();

    if (!context.channel_id) {
      await setSuggestedPrompts({
        title: 'Try one of these:',
        prompts: [
          {
            title: 'Check my inbox',
            message: 'Give me an inbox briefing for today.',
          },
          {
            title: 'Pipeline status',
            message: 'Show me the current sales pipeline.',
          },
          {
            title: 'Financial snapshot',
            message: 'What does cash flow look like this month?',
          },
        ],
      });
    }
  } catch (e) {
    logger.error(e);
  }
};
