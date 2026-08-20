(function () {
  var $ = function (id) { return document.getElementById(id); };
  var FORMATS = (window.confdiff && window.confdiff.FORMATS) || ["json","yaml","toml","ini","env","csv","xml"];
  var faSel = $("fa"), fbSel = $("fb");
  ["auto"].concat(FORMATS).forEach(function (f) {
    [faSel, fbSel].forEach(function (sel) {
      var o = document.createElement("option"); o.value = f; o.textContent = f; sel.appendChild(o);
    });
  });

  var examples = {
    yaml: {
      fa: "auto", fb: "auto",
      a: "service:\n  name: api\n  port: 8080\n  replicas: 2\n  tags:\n    - web\n    - prod\n  timeout: 30\n",
      b: "service:\n  name: api\n  port: 9090\n  replicas: 3\n  tags:\n    - web\n    - prod\n    - canary\n  retries: 5\n"
    },
    cross: {
      fa: "json", fb: "yaml",
      a: '{\n  "db": { "host": "localhost", "port": 5432, "ssl": true }\n}\n',
      b: "db:\n  host: db.internal\n  port: 5432\n  ssl: true\n"
    },
    env: {
      fa: "env", fb: "env", loose: true,
      a: "DEBUG=false\nPORT=8080\nWORKERS=4\nAPI_URL=http://localhost\n",
      b: "DEBUG=true\nPORT=8080\nWORKERS=8\nTIMEOUT=30\n"
    },
    k8s: {
      fa: "auto", fb: "auto",
      a: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n  labels:\n    app: api\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n        - name: api\n          image: registry/api:1.4.0\n          resources:\n            limits:\n              cpu: \"500m\"\n              memory: 256Mi\n          env:\n            - name: LOG_LEVEL\n              value: info\n",
      b: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api\n  labels:\n    app: api\nspec:\n  replicas: 4\n  template:\n    spec:\n      containers:\n        - name: api\n          image: registry/api:1.5.2\n          resources:\n            limits:\n              cpu: \"1000m\"\n              memory: 256Mi\n          env:\n            - name: LOG_LEVEL\n              value: warn\n"
    }
  };

  function loadExample(name) {
    var e = examples[name]; if (!e) return;
    $("a").value = e.a; $("b").value = e.b;
    faSel.value = e.fa || "auto"; fbSel.value = e.fb || "auto";
    $("loose").checked = !!e.loose;
    render();
  }

  function render() {
    var a = $("a").value, b = $("b").value;
    var out = $("out"), fmt = $("fmt");
    if (!a.trim() && !b.trim()) { out.innerHTML = '<span class="cd-none">Paste two configs above, or load an example.</span>'; fmt.textContent = ""; return; }
    var r = window.confdiff.run(a, b, {
      formatA: faSel.value, formatB: fbSel.value,
      loose: $("loose").checked, arraySet: $("arraySet").checked
    });
    if (r.error) { out.innerHTML = '<span class="cd-err">Error: ' + r.error.replace(/[&<>]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}) + '</span>'; fmt.textContent = ""; return; }
    fmt.textContent = "detected: A = " + r.fa + "  ·  B = " + r.fb;
    out.innerHTML = $("showjson").checked ? '<pre style="margin:0">' + r.json.replace(/[&<>]/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}) + '</pre>' : r.html;
  }

  ["a","b"].forEach(function (id) { $(id).addEventListener("input", render); });
  ["fa","fb","loose","arraySet","showjson"].forEach(function (id) { $(id).addEventListener("change", render); });
  $("ex-yaml").addEventListener("click", function(){ loadExample("yaml"); });
  $("ex-cross").addEventListener("click", function(){ loadExample("cross"); });
  $("ex-env").addEventListener("click", function(){ loadExample("env"); });
  $("ex-k8s").addEventListener("click", function(){ loadExample("k8s"); });
  $("ex-clear").addEventListener("click", function(){ $("a").value=""; $("b").value=""; render(); });

  loadExample("yaml");
})();
