      const recorded = structuredClone(outcome);
      state.tasks[index] = { ...task, businessOutcome: recorded, updatedAt: recorded.verifiedAt ?? new Date().toISOString() };
      state.company.updatedAt = state.tasks[index].updatedAt;
      this.audit(actorRole, recorded.verified === true ? "business.outcome.verified" : "business.outcome.recorded", {
        taskId,
        outcomeId: recorded.outcomeId,
        verified: recorded.verified === true,
      }, false);
      persist();
      return structuredClone(recorded);
    },