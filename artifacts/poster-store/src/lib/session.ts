import { v4 as uuidv4 } from "uuid";

export const getSessionId = (): string => {
  const SESSION_KEY = "poster_session_id";
  let sessionId = localStorage.getItem(SESSION_KEY);
  
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  
  return sessionId;
};
