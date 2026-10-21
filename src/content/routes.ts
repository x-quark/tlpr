/** Only conversation views: PR file review comments are an explicit supported subroute. */
export function isConversationLocation(
  location: Pick<Location, 'protocol' | 'hostname' | 'pathname'>,
): boolean {
  return (
    location.protocol === 'https:' &&
    location.hostname === 'github.com' &&
    /^\/[^/]+\/[^/]+\/(?:issues\/[1-9]\d*\/?|pull\/[1-9]\d*(?:\/files)?\/?)$/.test(
      location.pathname,
    )
  );
}
