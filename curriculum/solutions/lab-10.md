# Lab 10 answers — Ask Northwind

The correct design has three boundaries: a browser-facing storefront facade, a
private Agent SDK container, and narrowly scoped MCP tools. The agent sees no
filesystem, shell, browser, or arbitrary network tools. It receives trusted
surface/page context from the facade and treats the visitor's message as
untrusted content.

A customer-facing action is a proposal, not a tool call that changes data. The
confirmation endpoint validates an expiring, single-use proposal against the
session and re-derives policy authority before writing a fictional case record.
That makes the confirmation useful even when the model is mistaken or prompted
to skip it.
