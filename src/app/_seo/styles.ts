export const contentPageStyles = `
.cm-content {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 20px 80px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.65;
  color: #1a1a2e;
}
.cm-content h1 {
  font-size: 2.4rem;
  line-height: 1.15;
  margin: 0 0 0.6em;
  letter-spacing: -0.02em;
}
.cm-content h2 {
  font-size: 1.4rem;
  line-height: 1.25;
  margin: 2em 0 0.6em;
  letter-spacing: -0.01em;
}
.cm-content h3 {
  font-size: 1.1rem;
  margin: 1.6em 0 0.4em;
}
.cm-content p, .cm-content li {
  font-size: 1.02rem;
  color: #2b2b3d;
}
.cm-content p {
  margin: 0 0 1em;
}
.cm-content .cm-lede {
  font-size: 1.15rem;
  color: #444;
}
.cm-content ul, .cm-content ol {
  padding-left: 1.4em;
  margin: 0 0 1em;
}
.cm-content li {
  margin-bottom: 0.4em;
}
.cm-content a {
  color: #FF6B35;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.cm-content a:hover {
  color: #e85d2c;
}
.cm-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.92em;
  background: #f5f5f7;
  padding: 1px 6px;
  border-radius: 4px;
}
.cm-content hr {
  border: 0;
  border-top: 1px solid #eee;
  margin: 2.4em 0;
}
.cm-content .cm-footer-note {
  font-style: italic;
  color: #555;
}
.cm-content .cm-nav {
  font-size: 0.92rem;
  color: #888;
  margin-bottom: 24px;
}
.cm-content .cm-nav a {
  color: #888;
  text-decoration: none;
  font-weight: 500;
}
.cm-content .cm-nav a:hover {
  color: #FF6B35;
}
.cm-content .cm-nav-sep {
  margin: 0 8px;
}
.cm-content .cm-cross-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 2em;
  padding: 18px 20px;
  background: #FFF8F5;
  border: 1px solid rgba(255, 107, 53, 0.15);
  border-radius: 10px;
}
.cm-content .cm-cross-links a {
  text-decoration: none;
  font-weight: 600;
}
.cm-content table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.92rem;
  margin: 1em 0 2em;
  display: block;
  overflow-x: auto;
}
.cm-content thead th {
  text-align: left;
  padding: 10px 8px;
  border-bottom: 2px solid #1a1a2e;
  font-weight: 700;
  white-space: nowrap;
}
.cm-content tbody td {
  padding: 8px;
  border-bottom: 1px solid #eee;
  vertical-align: top;
}
.cm-content tbody tr:nth-child(even) td {
  background: #fafafa;
}
.cm-content details {
  margin: 0 0 12px;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px 16px;
  background: #fdfdfd;
}
.cm-content details[open] {
  background: #FFF8F5;
  border-color: rgba(255, 107, 53, 0.2);
}
.cm-content summary {
  cursor: pointer;
  font-weight: 600;
  color: #1a1a2e;
}
.cm-content details > p {
  margin-top: 0.6em;
  margin-bottom: 0;
}
`;
