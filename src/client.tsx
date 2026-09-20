import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import "./style.css";

function Chat() {
  const agent = useAgent({
    agent: "OpsPilotAgent",
  });

  const [input, setInput] = useState("");
  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent,
  });

  const busy = status === "streaming" || status === "submitted";

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const text = input.trim();

    if (!text || busy) {
      return;
    }

    sendMessage({ text });
    setInput("");
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">CLOUDFLARE AGENT DEMO</p>

          <h1>OpsPilot</h1>

          <p className="subtitle">AI infrastructure operations assistant</p>
        </div>

        <div className="status-pill">
          <span className="dot" />
          {busy ? "Investigating" : "Ready"}
        </div>
      </header>

      <section className="capabilities">
        <span>LLM</span>
        <span>Workflow</span>
        <span>Tools</span>
        <span>Persistent State</span>
        <span>Chat</span>
      </section>

      <section className="chat-card">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty">
              <h2>Investigate a service incident</h2>

              <p>Try: “Diagnose the API service and tell me what is wrong.”</p>

              <div className="examples">
                <button
                  type="button"
                  onClick={() =>
                    sendMessage({
                      text: "Diagnose the API service and tell me what is wrong.",
                    })
                  }
                >
                  Diagnose API
                </button>

                <button
                  type="button"
                  onClick={() =>
                    sendMessage({
                      text: "Check search health and recent errors.",
                    })
                  }
                >
                  Check search
                </button>

                <button
                  type="button"
                  onClick={() =>
                    sendMessage({
                      text: "What do you remember about the last incident?",
                    })
                  }
                >
                  Show state
                </button>
              </div>
            </div>
          )}

          {messages.map((message) => {
            const text = message.parts
              .filter((part) => part.type === "text")
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("");

            const toolCount = message.parts.filter((part) =>
              part.type.startsWith("tool-"),
            ).length;

            return (
              <article key={message.id} className={`message ${message.role}`}>
                <div className="message-role">
                  {message.role === "user" ? "You" : "OpsPilot"}
                </div>

                <div className="message-body">
                  {text && <div className="assistant-text">{text}</div>}

                  {message.role === "assistant" && toolCount > 0 && (
                    <details className="tool-result">
                      <summary>
                        {toolCount} tool
                        {toolCount === 1 ? "" : "s"} executed
                      </summary>

                      <div className="tool-list">
                        <div className="tool-item">
                          ✓ Infrastructure analysis completed
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <form className="composer" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about api, payments, auth, or search…"
            aria-label="Message"
          />

          <button type="submit" disabled={!input.trim() || busy}>
            {busy ? "Working..." : "Send"}
          </button>
        </form>

        <button type="button" className="clear" onClick={clearHistory}>
          Clear conversation
        </button>
      </section>

      <footer>
        Built with Cloudflare Workers AI, Agents SDK, Durable Objects, React,
        and the AI SDK.
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Chat />);
