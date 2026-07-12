#!/usr/bin/env python3
import sys
import json
import re
import time
import random
import threading
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor
import cloudscraper
from bs4 import BeautifulSoup

BASE = "https://qoj.ac"
MAX_WORKERS = 5
MAX_RETRIES = 8

_thread_local = threading.local()


def iso_to_dt(iso_str: str) -> datetime:
  return datetime.fromisoformat(
    str(iso_str).replace("Z", "+00:00")
  ).astimezone(timezone.utc)


def dt_to_iso_utc(dt: datetime) -> str:
  return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


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
      "AppleWebKit/537.36"
    )
  })
  return scraper


def get_thread_scraper(session_cookie: str):
  if not hasattr(_thread_local, "scraper"):
    _thread_local.scraper = make_scraper(session_cookie)
  return _thread_local.scraper


def request_with_retries(scraper, url: str, *, timeout: int = 20):
  last_response = None

  for attempt in range(MAX_RETRIES):
    response = scraper.get(url, timeout=timeout)
    last_response = response

    if response.status_code == 200:
      return response

    if response.status_code != 429:
      raise RuntimeError(
        f"Request failed for {url}: HTTP {response.status_code}"
      )

    retry_after = response.headers.get("Retry-After")

    if retry_after is not None:
      try:
        delay = float(retry_after)
      except ValueError:
        delay = min(30.0, 2.0 ** attempt)
    else:
      delay = min(30.0, 2.0 ** attempt)

    delay += random.uniform(0.2, 1.0)
    time.sleep(delay)

  status = last_response.status_code if last_response is not None else "unknown"
  raise RuntimeError(
    f"Request failed for {url} after {MAX_RETRIES} attempts: HTTP {status}"
  )


def extract_problem_id_from_url(url: str) -> int | None:
  match = re.search(r"/problem/(\d+)", url or "")
  return int(match.group(1)) if match else None


def parse_server_time_offset(soup: BeautifulSoup) -> timedelta:
  p_tag = soup.find(
    "p",
    string=re.compile(
      r"Server Time:\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}"
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

  for row in rows:
    try:
      submission_link = row.select_one(
        "td a[href^='/submission/']"
      )
      if not submission_link:
        continue

      submission_id = submission_link["href"].rsplit("/", 1)[-1]

      problem_link = row.select_one(
        "td a[href*='/problem/']"
      )
      if not problem_link:
        continue

      problem_id = extract_problem_id_from_url(
        problem_link["href"]
      )
      if problem_id is None:
        continue

      smalls = row.find_all("small")
      if not smalls:
        continue

      timestamp_string = smalls[0].get_text(strip=True)
      local_naive = datetime.strptime(
        timestamp_string,
        "%Y-%m-%d %H:%M:%S"
      )

      submission_utc = (
        local_naive - server_offset
      ).replace(tzinfo=timezone.utc)

      results.append({
        "submission_id": submission_id,
        "problem_id": problem_id,
        "submission_time_iso": dt_to_iso_utc(submission_utc),
      })

    except Exception:
      continue

  return results


def discover_max_page(scraper, username: str) -> int:
  url = f"{BASE}/submissions?submitter={username}&page=10000000"

  try:
    response = request_with_retries(scraper, url)
  except Exception:
    return 1

  soup = BeautifulSoup(response.text, "html.parser")
  active = soup.select_one("li.page-item.active a.page-link")

  if active:
    try:
      return int(active.get_text(strip=True))
    except ValueError:
      pass

  max_page = 1

  for link in soup.select("li.page-item a.page-link"):
    try:
      page_number = int(link.get_text(strip=True))
      max_page = max(max_page, page_number)
    except ValueError:
      continue

  return max_page


def fetch_submission_details(scraper, sub_id: str):
  url = f"{BASE}/submission/{sub_id}"
  response = request_with_retries(scraper, url)
  soup = BeautifulSoup(response.text, "html.parser")

  problem_id = None
  problem_link = soup.select_one("a[href*='/problem/']")

  if problem_link:
    problem_id = extract_problem_id_from_url(
      problem_link["href"]
    )

  subtask_scores = []
  total_score = 0.0

  for header in soup.select("div.card-header"):
    title_element = header.select_one("h3.card-title")

    if not title_element:
      continue

    title_text = title_element.get_text(" ", strip=True)

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

    if match:
      value = float(match.group(1))
      subtask_scores.append(
        int(value) if value.is_integer() else round(value, 2)
      )
    else:
      subtask_scores.append(0)

  if subtask_scores:
    total_value = sum(float(value) for value in subtask_scores)
    total_score = (
      int(total_value)
      if total_value.is_integer()
      else round(total_value, 2)
    )
  else:
    score_badge = soup.select_one("a.uoj-score[data-score]")

    if score_badge and score_badge.get("data-score"):
      try:
        score = float(score_badge["data-score"])
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


def main():
  try:
    raw_input = sys.stdin.read()

    if not raw_input.strip():
      raise ValueError("No JSON input was provided on stdin")

    data = json.loads(raw_input)

    session = data["session"]
    username = data["username"]
    contest = data["contest"]

    start_dt = iso_to_dt(contest["startedAt"])

    if contest["endedAt"] is None:
      end_dt = datetime.now(timezone.utc)
    else:
      end_dt = iso_to_dt(contest["endedAt"])

    problems = contest["contest"]["problems"]

    problem_id_map = {}

    for contest_problem in problems:
      contest_problem_id = contest_problem["id"]
      problem = contest_problem["problem"]

      for problem_link in problem.get("problemLinks", []):
        if problem_link.get("platform") != "qoj.ac":
          continue

        problem_id = extract_problem_id_from_url(
          problem_link.get("url")
        )

        if problem_id is not None:
          problem_id_map[problem_id] = {
            "contest_problem_id": contest_problem_id
          }

    scraper = make_scraper(session)
    max_page = discover_max_page(scraper, username)

    relevant = []
    stop_pagination = False

    for page in range(1, max_page + 1):
      if stop_pagination:
        break

      url = (
        f"{BASE}/submissions?"
        f"submitter={username}&page={page}"
      )

      response = request_with_retries(scraper, url)
      soup = BeautifulSoup(response.text, "html.parser")
      server_offset = parse_server_time_offset(soup)

      items = parse_submissions_rows_for_page(
        response.text,
        server_offset
      )

      if not items:
        continue

      for item in items:
        submission_dt = iso_to_dt(
          item["submission_time_iso"]
        )

        if submission_dt < start_dt:
          stop_pagination = True
          break

        if submission_dt > end_dt:
          continue

        problem_id = item["problem_id"]

        if problem_id in problem_id_map:
          relevant.append({
            "submission_id": item["submission_id"],
            "submission_time": item["submission_time_iso"],
            "contest_problem_id": (
              problem_id_map[problem_id]["contest_problem_id"]
            )
          })

      time.sleep(0.5)

    def worker(submission):
      time.sleep(random.uniform(0.0, 0.8))

      thread_scraper = get_thread_scraper(session)
      details = fetch_submission_details(
        thread_scraper,
        submission["submission_id"]
      )

      return {
        "virtualContestId": contest["userId"],
        "contestProblemId": submission["contest_problem_id"],
        "time": submission["submission_time"],
        "score": details["total_score"],
        "subtaskScores": details["subtask_scores"]
      }

    submissions_out = []

    if relevant:
      with ThreadPoolExecutor(
        max_workers=MAX_WORKERS,
        thread_name_prefix="submission-worker"
      ) as executor:
        for item in executor.map(worker, relevant):
          if item is not None:
            submissions_out.append(item)

    submissions_out.sort(key=lambda item: item["time"])

    sys.stdout.write(json.dumps({
      "submissions": submissions_out
    }))
    sys.stdout.flush()

  except Exception as exc:
    sys.stdout.write(json.dumps({
      "error": str(exc)
    }))
    sys.stdout.flush()
    sys.exit(1)


if __name__ == "__main__":
  main()