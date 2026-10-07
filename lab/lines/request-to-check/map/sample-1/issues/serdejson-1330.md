# serdejson-1330

Repository: serde-rs/json · Issue #1330 · Group: open · Created: 2026-07-08T00:30:34Z
Labels: none · Reporter's role: MEMBER

## Title

Deserialization memory budget

## Body

From an email:

---

Hi David,

Hope you are well.

I am reaching out from the security team at the University of Sydney. We identified a potential issue in your system (https://github.com/serde-rs/json).

We tried to report it through private channels such as GitHub Security and Quality, but could not find a dedicated vulnerability reporting channel. We found your email address on the website and would appreciate it if you could take a look when you have time.

serde_json::from_str and related parsing functions allocate heap memory proportional to the size of the input JSON without any built-in limit. The ValueVisitor::visit_seq method creates an unbounded Vec<Value> and the visit_map method creates an unbounded Map<String, Value>. An attacker who can control or influence the JSON input to an application using serde_json can cause the process to consume all available memory, resulting in denial of service via OOM kill. The Deserializer struct has no field for tracking total allocation size or enforcing a memory budget. An unprivileged attacker who can reach a JSON parsing endpoint can exhaust the process's available memory, causing the application to crash and become unavailable. In containerized deployments with memory limits, the container is killed. In shared environments, this may also affect co-located services.

We are happy to have a call or provide any additional details or verification if needed.
Best regards,
Liyi, Ziyue, Strick, Maurice and Chenchen

About Us
We are a security research team from the University of Sydney, focusing on detecting open source software vulnerabilities.
Liyi Zhou: https://lzhou1110.github.io/
Ziyue Wang: https://zyy0530.github.io/
Strick: https://str1ckl4nd.github.io/
Maurice: https://maurice.busystar.org/
Chenchen Yu: https://7thparkk.github.io/

## Comments (0)
