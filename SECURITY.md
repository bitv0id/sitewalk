# Security Policy

## Supported versions

The latest release on `main` is the only supported version.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately, either way:

- GitHub's private vulnerability reporting — **Security → Report a vulnerability**
  on the repository page.
- Email the maintainer at 4squall@gmail.com.

Include what you found, how to reproduce it, and what an attacker could do with
it. You can expect an initial response within a few days.

## Scope

This is a crawler that sends HTTP `GET` requests to sites you point it at.
The security-relevant surface is small but real:

| Concern                          | Notes                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requests to unintended hosts** | The crawler is scoped to the entry host. A bug that lets it wander to arbitrary hosts is a valid report.                                                                         |
| **State-changing requests**      | Only `GET` is ever sent, and paths that look like they log out, delete, order or export are skipped. A way to make the tool act on a site rather than read it is a valid report. |
| **`robots.txt` bypass**          | Rules are honoured unless `--no-robots` is passed. A parsing bug that silently ignores a `Disallow` is a valid report.                                                           |
| **`--insecure` / `--no-robots`** | These disable protections on purpose. Their existence is not a vulnerability; a case where they apply without being asked for is.                                                |
| **Crawled content**              | Response bodies are parsed with regular expressions and never executed. Anything that lets crawled markup affect the host running the tool is a valid report.                    |

## Not in scope

- Findings that require passing `--no-robots` or `--insecure`.
- Denial of service caused by pointing the tool at a site with a very large
  `steps` value. Use `--delay` and respect the site you are testing.
