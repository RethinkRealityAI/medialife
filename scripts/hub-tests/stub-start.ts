// Stands in for TanStack Start’s request context when the hub modules run outside the server.
export const getRequest = () => new Request("http://localhost/");
