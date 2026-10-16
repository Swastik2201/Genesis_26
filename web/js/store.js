/**
 * ==========================================================================
 * BEAT THE BOT — OBSERVABLE STATE STORE (store.js)
 * Lightweight reactive store holding session state, event log, and UI status.
 * ==========================================================================
 */

const initialState = {
  currentSession: null,
  gameId: 'snake',
  sessions: [],
  events: [],
  selectedStep: null,
  latestEvent: null,
  isStreaming: false,
  isMockMode: false,
  score: 0,
  latencyMs: 0,
  stepCount: 0,
  status: 'idle', // 'idle' | 'streaming' | 'paused' | 'completed' | 'error'
  error: null
};

class Store {
  constructor(state = initialState) {
    this._state = { ...state };
    this._listeners = new Set();
  }

  /**
   * Retrieves the current state snapshot.
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Updates state partially and notifies subscribers with diff.
   * @param {Object} partial - Subset of state to merge
   */
  setState(partial) {
    const prevState = { ...this._state };
    this._state = { ...this._state, ...partial };
    
    // Auto-calculate derived telemetry from latest event if events updated
    if (partial.events && partial.events.length > 0) {
      const latest = partial.events[partial.events.length - 1];
      this._state.latestEvent = latest;
      this._state.stepCount = latest.step;
      this._state.score = latest.game_response?.score_after ?? latest.state?.score ?? this._state.score;
      this._state.gameId = latest.game_id || this._state.gameId;
      if (latest.laya_calls && latest.laya_calls.length > 0) {
        this._state.latencyMs = latest.laya_calls[latest.laya_calls.length - 1].latency_ms || 0;
      }
    }

    this._notify(prevState);
  }

  /**
   * Subscribes a callback to store changes.
   * @param {Function} listener - Callback (state, prevState) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(prevState) {
    const currentState = this.getState();
    for (const listener of this._listeners) {
      try {
        listener(currentState, prevState);
      } catch (err) {
        console.error('[Store] Error in subscriber:', err);
      }
    }
  }

  // --- Convenience Action Helpers ---

  setSession(sessionId) {
    if (this._state.currentSession === sessionId) return;
    this.setState({
      currentSession: sessionId,
      events: [],
      selectedStep: null,
      latestEvent: null,
      score: 0,
      latencyMs: 0,
      stepCount: 0,
      status: 'idle',
      error: null
    });
  }

  setSessions(sessions) {
    this.setState({ sessions });
    if (!this._state.currentSession && sessions.length > 0) {
      this.setSession(sessions[0].session_id);
    }
  }

  addEvent(event) {
    if (!event) return;
    const currentEvents = [...this._state.events];
    const existingIdx = currentEvents.findIndex(e => e.step === event.step);

    if (existingIdx >= 0) {
      currentEvents[existingIdx] = event;
    } else {
      currentEvents.push(event);
      currentEvents.sort((a, b) => a.step - b.step);
    }

    const lastCall = event.laya_calls?.[event.laya_calls.length - 1];
    const latency = lastCall?.latency_ms ?? this._state.latencyMs;
    const score = event.game_response?.score_after ?? event.state?.score ?? this._state.score;
    const isCompleted = event.game_response?.done === true || event.state?.done === true;

    this.setState({
      events: currentEvents,
      latestEvent: event,
      stepCount: event.step,
      score,
      latencyMs: latency,
      gameId: event.game_id || this._state.gameId,
      currentSession: event.session_id || this._state.currentSession,
      status: isCompleted ? 'completed' : (this._state.isStreaming ? 'streaming' : this._state.status)
    });
  }

  setEvents(events) {
    this.setState({ events: [...events] });
  }

  selectStep(step) {
    this.setState({ selectedStep: step });
  }

  setStreaming(isStreaming) {
    this.setState({
      isStreaming,
      status: isStreaming ? 'streaming' : (this._state.status === 'completed' ? 'completed' : 'paused')
    });
  }

  setMockMode(isMockMode) {
    this.setState({ isMockMode });
  }

  setError(error) {
    this.setState({ error, status: 'error' });
  }
}

export const store = new Store();
