// The contact page's form (contact.html): checks the fields as the title
// service will (proxy/src/contact.js), sends them there, and says what happened.
(function () {
  "use strict";

  var ENDPOINT = "https://api.flickcue.in/contact";
  var SUPPORT = "support@flickcue.in";
  var LIMITS = { name: 100, email: 254, subject: 150, messageMin: 10, message: 3000 };
  var EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

  var form = document.getElementById("contact");
  var banner = document.getElementById("banner");
  var done = document.getElementById("done");
  var send = document.getElementById("send");
  var again = document.getElementById("again");
  var counter = document.getElementById("message-count");
  var fields = ["name", "email", "subject", "message"];
  if (!form || !banner || !done || !send) return;

  // Cloudflare Turnstile, when the page has a site key (data-turnstile-sitekey on the form): a check that is
  // usually invisible. Without a key nothing is loaded and nothing is asked for.
  var SITE_KEY = form.getAttribute("data-turnstile-sitekey") || "";
  var captchaBox = document.getElementById("captcha");
  var captchaOn = Boolean(SITE_KEY && captchaBox);
  var token = "";
  var widget = null;
  var captchaBroken = false;

  var input = function (name) { return document.getElementById(name); };
  var line = function (text) { return String(text || "").replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim(); };

  /** The messages for any field that's wrong; an empty object when all are fine. */
  function check(values) {
    var errors = {};
    if (!values.name) errors.name = "Enter your name.";
    else if (values.name.length > LIMITS.name) errors.name = "Keep your name under " + LIMITS.name + " characters.";
    if (!values.email) errors.email = "Enter your email address.";
    else if (values.email.length > LIMITS.email || !EMAIL.test(values.email)) errors.email = "Enter a valid email address, like name@example.com.";
    if (!values.subject) errors.subject = "Enter a subject.";
    else if (values.subject.length > LIMITS.subject) errors.subject = "Keep the subject under " + LIMITS.subject + " characters.";
    if (values.message.length < LIMITS.messageMin) errors.message = "Write a few words (at least " + LIMITS.messageMin + " characters).";
    else if (values.message.length > LIMITS.message) errors.message = "Keep the message under 3,000 characters.";
    return errors;
  }

  function read() {
    return {
      name: line(input("name").value),
      email: line(input("email").value),
      subject: line(input("subject").value),
      message: input("message").value.replace(/\r\n?/g, "\n").trim(),
      website: input("website").value
    };
  }

  function show(errors) {
    fields.forEach(function (name) {
      var holder = input(name).closest(".field");
      var text = errors[name] || "";
      holder.classList.toggle("has-error", Boolean(text));
      document.getElementById(name + "-error").textContent = text;
      if (text) input(name).setAttribute("aria-invalid", "true");
      else input(name).removeAttribute("aria-invalid");
    });
  }

  function say(html) {
    banner.textContent = "";
    if (!html) {
      banner.classList.remove("show");
      return;
    }
    banner.append(html);
    banner.classList.add("show");
  }

  function emailLink(prefix) {
    var span = document.createElement("span");
    span.append(prefix + " ");
    var link = document.createElement("a");
    link.href = "mailto:" + SUPPORT;
    link.textContent = SUPPORT;
    span.append(link, ".");
    return span;
  }

  function startCaptcha() {
    if (!captchaOn) return;
    captchaBox.hidden = false;
    var script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = function () {
      widget = window.turnstile.render(captchaBox, {
        sitekey: SITE_KEY,
        callback: function (value) { token = value; captchaBroken = false; },
        "expired-callback": function () { token = ""; },
        "error-callback": function () { token = ""; captchaBroken = true; }
      });
    };
    script.onerror = function () {
      captchaBroken = true;
      say(emailLink("The spam check couldn't load (a content blocker can stop it). You can email us at"));
    };
    document.head.append(script);
  }

  // A token works once: after any answer, the check starts again.
  function resetCaptcha() {
    token = "";
    if (widget !== null && window.turnstile) window.turnstile.reset(widget);
  }

  function count() {
    var length = input("message").value.length;
    counter.textContent = length.toLocaleString("en-US") + " / 3,000";
    counter.classList.toggle("over", length > LIMITS.message);
  }

  // A field's message clears as soon as what's in it is fine again.
  fields.forEach(function (name) {
    input(name).addEventListener("input", function () {
      if (name === "message") count();
      var holder = input(name).closest(".field");
      if (!holder.classList.contains("has-error") || check(read())[name]) return;
      holder.classList.remove("has-error");
      document.getElementById(name + "-error").textContent = "";
      input(name).removeAttribute("aria-invalid");
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    say(null);
    var values = read();
    var errors = check(values);
    show(errors);
    var first = fields.find(function (name) { return errors[name]; });
    if (first) {
      input(first).focus();
      return;
    }

    if (captchaOn && !token) {
      say(captchaBroken ? emailLink("The spam check isn't working. You can email us at") : "Please wait a moment for the check to finish, then send again.");
      banner.focus();
      return;
    }

    if (captchaOn) values["cf-turnstile-response"] = token;
    send.disabled = true;
    send.textContent = "Sending…";
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 15000);
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(values),
      signal: controller.signal
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) { return { status: response.status, data: data }; });
      })
      .then(function (result) {
        if (result.status === 200 && result.data.ok) {
          resetCaptcha();
          form.reset();
          count();
          show({});
          form.style.display = "none";
          done.classList.add("show");
          done.focus();
          return;
        }
        resetCaptcha();
        if (result.status === 400 && result.data.captcha) {
          say("The check didn't pass. Please try once more.");
          banner.focus();
          return;
        }
        if (result.status === 400 && result.data.fields) {
          show(result.data.fields);
          var bad = fields.find(function (name) { return result.data.fields[name]; });
          if (bad) input(bad).focus();
          return;
        }
        if (result.status === 429) say("You've sent a few messages in a row. Wait a minute and try again.");
        else say(emailLink("The message couldn't be sent just now. You can email us at"));
        banner.focus();
      })
      .catch(function () {
        resetCaptcha();
        say(emailLink("Couldn't reach FlickCue. Check your connection, or email us at"));
        banner.focus();
      })
      .then(function () {
        clearTimeout(timer);
        send.disabled = false;
        send.textContent = "Send message";
      });
  });

  again.addEventListener("click", function () {
    done.classList.remove("show");
    form.style.display = "";
    say(null);
    input("name").focus();
  });

  // A link from the site (the title page's "Wrong link?") can fill the subject and message in; it only fills them
  // in, as text: the person reads it, adds to it and sends it.
  var prefill = new URLSearchParams(location.search);
  if (prefill.get("subject")) input("subject").value = line(prefill.get("subject")).slice(0, LIMITS.subject);
  if (prefill.get("message")) {
    input("message").value = prefill.get("message").replace(/\r\n?/g, "\n").slice(0, LIMITS.message);
    input("message").focus();
    input("message").setSelectionRange(input("message").value.length, input("message").value.length);
  }

  count();
  startCaptcha();
})();
