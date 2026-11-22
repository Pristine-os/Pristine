// The error shape every API route returns on failure ({ error, details? }).
// Pages intersect it with the success type of the response they parse.
export type ApiErrorBody = {
  error?: string;
  details?: string;
};
