#!/usr/bin/env python3

import sys
import json
import queue
import random
import re
import threading
import time
import traceback
from datetime import datetime, timezone, timedelta

import cloudscraper
from bs4 import BeautifulSoup


BASE = "https://qoj.ac"

DEBUG = True
MAX_RETRIES = 12

REQUEST_INTERVAL_MIN_SECONDS = 7.0
REQUEST_INTERVAL_MAX_SECONDS = 12.0
BASE_RATE_LIMIT_COOLDOWN_SECONDS = 25.0
MAX_RATE_LIMIT_COOLDOWN_SECONDS = 120.0
RATE_LIMIT_BACKOFF_MULTIPLIER = 1.6

WORKER_START_JITTER_MAX_SECONDS = 10.0

COLOR_RESET = "\033[0m"
COLOR_GREEN = "\033[32m"
COLOR_RED = "\033[31m"
COLOR_YELLOW = "\033[33m"


def colorize(text: str, color: str) -> str:
  return f"{color}{text}{COLOR_RESET}"


def debug(message: str, **data):
  if not DEBUG:
    return

  timestamp = datetime.now(timezone.utc).isoformat(
    timespec="milliseconds"
  )
  thread_name = threading.current_thread().name

  suffix = ""

  if data:
    try:
      suffix = " " + json.dumps(
        data,
        default=str,
        ensure_ascii=False
      )
    except Exception:
      suffix = " " + repr(data)

  sys.stderr.write(
    f"[{timestamp}] [{thread_name}] "
    f"{message}{suffix}\n"
  )
  sys.stderr.flush()


def output_json(payload, exit_code: int = 0):
  debug(
    "Writing JSON output",
    exit_code=exit_code,
    payload=payload
  )

  sys.stdout.write(json.dumps(payload))
  sys.stdout.flush()

  if exit_code != 0:
    sys.exit(exit_code)


def iso_to_dt(iso_str: str) -> datetime:
  result = datetime.fromisoformat(
    str(iso_str).replace("Z", "+00:00")
  ).astimezone(timezone.utc)

  return result


def dt_to_iso_utc(dt: datetime) -> str:
  return (
    dt.astimezone(timezone.utc)
    .isoformat()
    .replace("+00:00", "Z")
  )


def make_scraper(session_cookie: str):
  scraper = cloudscraper.create_scraper()

  scraper.cookies.set(
    name="UOJSESSID",
    value=session_cookie,
    domain="qoj.ac",
    path="/"
  )

  scraper.headers.update({
    "User-Agent": (
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
      "text/html,application/xhtml+xml,application/xml;q=0.9,"
      "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
  })

  return scraper


class Account:
  """
  Wraps a single scraper account's session cookie, HTTP client and
  rate-limit state. Each account is rate-limited independently, so
  requests made through one account never wait on another account's
  cooldown.
  """

  def __init__(self, index: int, token: str):
    self.index = index
    self.token = token
    self.scraper = make_scraper(token)
    self.lock = threading.Lock()
    self.next_request_time = 0.0
    self.cooldown_until = 0.0

  @property
  def name(self) -> str:
    return f"account-{self.index}"


def parse_retry_after(value: str | None) -> float:
  if value is None:
    return 0.0

  try:
    return max(0.0, float(value))
  except ValueError:
    debug(
      "Invalid Retry-After value",
      raw=value
    )
    return 0.0


def gated_get(
  account: Account,
  url: str,
  *,
  attempt: int,
  timeout: int = 20
):
  debug(
    "Waiting for account request gate",
    account=account.name,
    url=url,
    attempt=attempt
  )

  with account.lock:
    now = time.monotonic()

    allowed_at = max(
      account.next_request_time,
      account.cooldown_until
    )

    wait_seconds = allowed_at - now

    if wait_seconds > 0:
      debug(
        "Account throttle sleeping",
        account=account.name,
        url=url,
        attempt=attempt,
        wait_seconds=round(wait_seconds, 3)
      )

      time.sleep(wait_seconds)

    started_at = time.monotonic()

    debug(
      "Sending HTTP request",
      account=account.name,
      url=url,
      attempt=attempt
    )

    response = account.scraper.get(url, timeout=timeout)
    finished_at = time.monotonic()

    next_interval = random.uniform(
      REQUEST_INTERVAL_MIN_SECONDS,
      REQUEST_INTERVAL_MAX_SECONDS
    )

    account.next_request_time = (
      finished_at
      + next_interval
    )

    debug(
      "Received HTTP response",
      account=account.name,
      url=url,
      attempt=attempt,
      status_code=response.status_code,
      response_length=len(response.text),
      elapsed_seconds=round(
        finished_at - started_at,
        3
      ),
      final_url=response.url
    )

    if response.status_code == 429:
      retry_after = parse_retry_after(
        response.headers.get("Retry-After")
      )

      progressive_cooldown = min(
        MAX_RATE_LIMIT_COOLDOWN_SECONDS,
        BASE_RATE_LIMIT_COOLDOWN_SECONDS
        * (RATE_LIMIT_BACKOFF_MULTIPLIER ** (attempt - 1))
      )

      cooldown = max(
        retry_after,
        progressive_cooldown
      )

      cooldown += random.uniform(1.0, 4.0)

      account.cooldown_until = max(
        account.cooldown_until,
        finished_at + cooldown
      )

      debug(
        "Applied rate-limit cooldown",
        account=account.name,
        url=url,
        attempt=attempt,
        applied_cooldown_seconds=round(cooldown, 3)
      )

    return response


def request_with_retries(
  account: Account,
  url: str,
  *,
  description: str,
  timeout: int = 20
):
  last_status = "unknown"

  debug(
    "Starting request with retries",
    account=account.name,
    description=description,
    url=url,
    max_retries=MAX_RETRIES
  )

  for attempt in range(1, MAX_RETRIES + 1):
    response = gated_get(
      account,
      url,
      attempt=attempt,
      timeout=timeout
    )

    last_status = response.status_code

    if response.status_code == 200:
      debug(
        colorize("Request succeeded", COLOR_GREEN),
        account=account.name,
        description=description,
        attempt=attempt
      )
      return response

    if response.status_code == 429:
      debug(
        colorize("Request rate limited", COLOR_RED),
        account=account.name,
        description=description,
        attempt=attempt,
        max_retries=MAX_RETRIES
      )
      continue

    raise RuntimeError(
      f"Failed to fetch {description}: "
      f"HTTP {response.status_code}"
    )

  raise RuntimeError(
    f"Failed to fetch {description} after "
    f"{MAX_RETRIES} attempts: HTTP {last_status}"
  )


def extract_problem_id_from_url(url: str) -> int | None:
  match = re.search(r"/problem/(\d+)", url or "")

  if not match:
    return None

  return int(match.group(1))


def parse_server_time_offset(soup: BeautifulSoup) -> timedelta:
  p_tag = soup.find(
    "p",
    string=re.compile(
      r"Server Time:\s*"
      r"\d{4}-\d{2}-\d{2}\s+"
      r"\d{2}:\d{2}:\d{2}"
    )
  )

  if not p_tag:
    return timedelta(0)

  match = re.search(
    r"Server Time:\s*([0-9:\-\s]{19})",
    p_tag.get_text(" ", strip=True)
  )

  if not match:
    return timedelta(0)

  server_naive = datetime.strptime(
    match.group(1),
    "%Y-%m-%d %H:%M:%S"
  )

  now_utc_naive = datetime.now(timezone.utc).replace(
    tzinfo=None,
    microsecond=0
  )

  return server_naive - now_utc_naive


def parse_submissions_rows_for_page(
  html: str,
  server_offset: timedelta
):
  soup = BeautifulSoup(html, "html.parser")
  rows = soup.select("table tbody tr")
  results = []

  for row_index, row in enumerate(rows):
    try:
      submission_link = row.select_one(
        "td a[href^='/submission/']"
      )

      if not submission_link:
        continue

      submission_id = (
        submission_link.get("href", "")
        .rsplit("/", 1)[-1]
      )

      problem_link = row.select_one(
        "td a[href*='/problem/']"
      )

      if not problem_link:
        continue

      problem_id = extract_problem_id_from_url(
        problem_link.get("href", "")
      )

      if problem_id is None:
        continue

      smalls = row.find_all("small")

      if not smalls:
        continue

      timestamp_string = smalls[0].get_text(
        strip=True
      )

      local_naive = datetime.strptime(
        timestamp_string,
        "%Y-%m-%d %H:%M:%S"
      )

      submission_utc = (
        local_naive - server_offset
      ).replace(tzinfo=timezone.utc)

      result = {
        "submission_id": submission_id,
        "problem_id": problem_id,
        "submission_time_iso": dt_to_iso_utc(
          submission_utc
        ),
      }

      results.append(result)

    except Exception as exc:
      debug(
        "Failed to parse submission row",
        row_index=row_index,
        error=str(exc),
        traceback=traceback.format_exc()
      )

  return results


def discover_max_page(account: Account, username: str) -> int:
  url = (
    f"{BASE}/submissions?"
    f"submitter={username}&page=10000000"
  )

  try:
    response = request_with_retries(
      account,
      url,
      description="maximum submissions page"
    )
  except RuntimeError as exc:
    debug(
      colorize("Failed to discover maximum page; defaulting to 1", COLOR_RED),
      error=str(exc)
    )
    return 1

  soup = BeautifulSoup(response.text, "html.parser")
  active = soup.select_one(
    "li.page-item.active a.page-link"
  )

  if active:
    try:
      return int(active.get_text(strip=True))
    except ValueError:
      pass

  max_page = 1

  for link in soup.select("li.page-item a.page-link"):
    try:
      max_page = max(
        max_page,
        int(link.get_text(strip=True))
      )
    except ValueError:
      continue

  return max_page


def fetch_submission_details(account: Account, submission_id: str):
  url = f"{BASE}/submission/{submission_id}"

  response = request_with_retries(
    account,
    url,
    description=f"submission {submission_id}"
  )

  soup = BeautifulSoup(response.text, "html.parser")

  problem_id = None
  problem_link = soup.select_one(
    "a[href*='/problem/']"
  )

  if problem_link:
    problem_id = extract_problem_id_from_url(
      problem_link.get("href", "")
    )

  subtask_scores = []
  total_score = 0.0

  for header in soup.select("div.card-header"):
    title_element = header.select_one("h3.card-title")

    if not title_element:
      continue

    title_text = title_element.get_text(
      " ",
      strip=True
    )

    if not re.search(
      r"^\s*Subtask\b",
      title_text,
      flags=re.I
    ):
      continue

    header_text = header.get_text(" ", strip=True)

    match = re.search(
      r"(?i)score:\s*([0-9]+(?:\.[0-9]+)?)",
      header_text
    )

    if not match:
      subtask_scores.append(0)
      continue

    value = float(match.group(1))

    subtask_scores.append(
      int(value)
      if value.is_integer()
      else round(value, 2)
    )

  if subtask_scores:
    total_value = sum(
      float(value)
      for value in subtask_scores
    )

    total_score = (
      int(total_value)
      if total_value.is_integer()
      else round(total_value, 2)
    )

  else:
    score_badge = soup.select_one(
      "a.uoj-score[data-score]"
    )

    if score_badge:
      raw_score = score_badge.get("data-score")

      if raw_score is not None:
        try:
          score = float(raw_score)

          total_score = (
            int(score)
            if score.is_integer()
            else round(score, 2)
          )

          subtask_scores = [total_score]

        except (TypeError, ValueError):
          pass

  return {
    "problem_id": problem_id,
    "total_score": total_score,
    "subtask_scores": subtask_scores
  }


def run_worker_pool(accounts: list[Account], relevant: list[dict], contest: dict):
  """
  Spawns exactly one worker thread per account, permanently bound to
  that account for its entire lifetime. Workers pull submissions off a
  shared queue until it's empty, so accounts never trade off which
  submissions they handle mid-run and never touch another account's
  rate-limit state.
  """

  work_queue: "queue.Queue[dict]" = queue.Queue()

  for submission in relevant:
    work_queue.put(submission)

  total_submissions = len(relevant)
  processed_count = 0

  results: list[dict] = []
  errors: list[BaseException] = []
  results_lock = threading.Lock()

  def worker_loop(account: Account):
    nonlocal processed_count

    initial_delay = random.uniform(0.0, WORKER_START_JITTER_MAX_SECONDS)

    debug(
      "Worker staggering start",
      account=account.name,
      initial_delay_seconds=round(initial_delay, 3)
    )

    time.sleep(initial_delay)

    while True:
      try:
        submission = work_queue.get_nowait()
      except queue.Empty:
        return

      submission_id = submission["submission_id"]

      debug(
        "Worker picked up submission",
        account=account.name,
        submission_id=submission_id
      )

      try:
        details = fetch_submission_details(
          account,
          submission_id
        )

        result = {
          "virtualContestId": contest["userId"],
          "contestProblemId": submission[
            "contest_problem_id"
          ],
          "time": submission["submission_time"],
          "score": details["total_score"],
          "subtaskScores": details["subtask_scores"]
        }

        with results_lock:
          results.append(result)
          processed_count += 1
          progress = f"{processed_count}/{total_submissions}"

        debug(
          f"{colorize('Worker completed submission', COLOR_GREEN)} "
          f"{colorize(f'[{progress}]', COLOR_YELLOW)}",
          account=account.name,
          submission_id=submission_id,
          result=result
        )

      except Exception as exc:
        with results_lock:
          errors.append(exc)
          processed_count += 1
          progress = f"{processed_count}/{total_submissions}"

        debug(
          f"{colorize('Worker failed', COLOR_RED)} "
          f"{colorize(f'[{progress}]', COLOR_YELLOW)}",
          account=account.name,
          submission_id=submission_id,
          error=str(exc),
          traceback=traceback.format_exc()
        )

  threads = [
    threading.Thread(
      target=worker_loop,
      args=(account,),
      name=f"submission-worker-{account.name}",
      daemon=True
    )
    for account in accounts
  ]

  for thread in threads:
    thread.start()

  for thread in threads:
    thread.join()

  if errors:
    raise errors[0]

  return results


def main():
  debug(
    "Script started",
    argv=sys.argv,
    python_version=sys.version
  )

  try:
    raw_input = sys.stdin.read()

    if not raw_input.strip():
      raise ValueError(
        "No JSON input was provided on stdin"
      )

    data = json.loads(raw_input)

    session_tokens = data["sessions"]
    username = data["username"]
    contest = data["contest"]

    if not session_tokens:
      raise ValueError(
        "No scraper account sessions were provided"
      )

    accounts = [
      Account(index, token)
      for index, token in enumerate(session_tokens)
    ]
    num_accounts = len(accounts)

    debug(
      "Parsed input",
      username=username,
      contest_keys=list(contest.keys()),
      account_count=num_accounts
    )

    start_dt = iso_to_dt(contest["startedAt"])

    if contest["endedAt"] is None:
      end_dt = datetime.now(timezone.utc)
    else:
      end_dt = iso_to_dt(contest["endedAt"])

    problem_id_map = {}

    for contest_problem in contest["contest"]["problems"]:
      contest_problem_id = contest_problem["id"]
      problem = contest_problem["problem"]

      for problem_link in problem.get(
        "problemLinks",
        []
      ):
        if problem_link.get("platform") != "qoj.ac":
          continue

        problem_id = extract_problem_id_from_url(
          problem_link.get("url", "")
        )

        if problem_id is not None:
          problem_id_map[problem_id] = {
            "contest_problem_id": contest_problem_id
          }

    debug(
      "Built problem ID map",
      problem_id_map=problem_id_map
    )

    max_page = discover_max_page(
      accounts[0],
      username
    )

    relevant = []
    stop_pagination = False

    for page in range(1, max_page + 1):
      if stop_pagination:
        break
      account = accounts[(page - 1) % num_accounts]

      url = (
        f"{BASE}/submissions?"
        f"submitter={username}&page={page}"
      )

      response = request_with_retries(
        account,
        url,
        description=f"submissions page {page}"
      )

      soup = BeautifulSoup(
        response.text,
        "html.parser"
      )

      server_offset = parse_server_time_offset(soup)

      items = parse_submissions_rows_for_page(
        response.text,
        server_offset
      )

      for item in items:
        submission_dt = iso_to_dt(
          item["submission_time_iso"]
        )

        if submission_dt < start_dt:
          debug(
            "Reached submission before contest start",
            submission_id=item["submission_id"],
            submission_time=submission_dt.isoformat(),
            contest_start=start_dt.isoformat()
          )

          stop_pagination = True
          break

        if submission_dt > end_dt:
          continue

        problem_id = item["problem_id"]

        if problem_id not in problem_id_map:
          continue

        relevant_submission = {
          "submission_id": item["submission_id"],
          "submission_time": item[
            "submission_time_iso"
          ],
          "contest_problem_id": (
            problem_id_map[problem_id][
              "contest_problem_id"
            ]
          )
        }

        relevant.append(relevant_submission)

    debug(
      "Finished collecting relevant submissions",
      relevant_count=len(relevant)
    )

    submissions_out = []

    if relevant:
      debug(
        "Starting worker pool",
        worker_count=num_accounts,
        submission_count=len(relevant)
      )

      submissions_out = run_worker_pool(
        accounts,
        relevant,
        contest
      )

    submissions_out.sort(
      key=lambda item: item["time"]
    )

    debug(
      colorize("Script completed successfully", COLOR_GREEN),
      submission_count=len(submissions_out)
    )

    output_json({
      "submissions": submissions_out
    })

  except Exception as exc:
    debug(
      colorize("Unhandled exception", COLOR_RED),
      error=str(exc),
      exception_type=type(exc).__name__,
      traceback=traceback.format_exc()
    )

    output_json(
      {"error": str(exc)},
      exit_code=1
    )


if __name__ == "__main__":
  main()
