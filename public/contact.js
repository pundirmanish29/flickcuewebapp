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
          form.reset();
          count();
          show({});
          form.style.display = "none";
          done.classList.add("show");
          done.focus();
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

  count();
})();
