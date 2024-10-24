import axios, { AxiosResponse } from 'axios';

/**
 * HTTP Client for making requests with exponential backoff retry logic.
 * inspired by firebase sdk backoff.ts
 * https://github.com/firebase/firebase-js-sdk/blob/master/packages/firestore/src/remote/backoff.ts
 */
export class HttpClient<T = any> {
  /**
   * Initial backoff time in milliseconds after an error.
   */
  
  private static DEFAULT_BACKOFF_INITIAL_DELAY_MS: number = 1000;
  private static DEFAULT_BACKOFF_FACTOR: number = 1.5;

  /** Maximum backoff time in milliseconds */
  private static DEFAULT_BACKOFF_MAX_DELAY_MS = 60 * 1000;

  private url: string = '';
  private onResolve: (res: AxiosResponse<any, T>) => void = () => {};

  private lastAttemptTime = Date.now();
  private currentBaseMs: number = 0;

  /**
   * Constructor to initialize the HTTP client with a target URL and resolve callback.
   * @param url The target URL for the HTTP request.
   * @param onResolve Callback function to handle the successful response.
   */
  public constructor(url: string, onResolve: (res: AxiosResponse<any, T>) => void) {
    this.url = url;
    this.onResolve = onResolve;
    this.reset();
  }

  /**
   * Resets the backoff delay to the initial value.
   */
  reset(): void {
    this.currentBaseMs = 0;
  }

  /**
   * Resets the backoff delay to the maximum delay value.
   */
  resetToMax(): void {
    this.currentBaseMs = HttpClient.DEFAULT_BACKOFF_MAX_DELAY_MS;
  }

  /**
   * Performs an HTTP GET request with exponential backoff retry logic in case of errors.
   */
  async get(): Promise<void> {
    try {
      var response = await axios.get(this.url);
    } catch (error) {
      console.log(error);
      // Apply backoff logic for retry attempts
      const currentTime = Date.now();
      const elapsedTime = currentTime - this.lastAttemptTime;
      this.lastAttemptTime = currentTime;

      const backoffDelay = Math.min(
        this.currentBaseMs || HttpClient.DEFAULT_BACKOFF_INITIAL_DELAY_MS,
        HttpClient.DEFAULT_BACKOFF_MAX_DELAY_MS
      );

      // Wait for the backoff delay before retrying the request
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));

      // Increase the backoff delay for subsequent retry attempts
      this.currentBaseMs =
        this.currentBaseMs === 0
          ? HttpClient.DEFAULT_BACKOFF_INITIAL_DELAY_MS
          : this.currentBaseMs * HttpClient.DEFAULT_BACKOFF_FACTOR;

      // Retry the request after backoff
      await this.get();
      return;
    }

    this.onResolve(response);
  }
}
