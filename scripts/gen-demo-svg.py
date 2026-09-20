#!/usr/bin/env python3
"""Generate an animated terminal demo SVG for confdiff (SMIL, loops, renders in GitHub README via <img>)."""

W = 760
CW = 8.4          # monospace char width @ font-size 14
X0 = 34           # command text start x
Y_PROMPT = 62
Y_OUT = 96
LH = 23
DUR = 11.0        # full loop seconds

cmd = "confdiff prod.env staging.env --redact"
cmd_w = len(cmd) * CW

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# ---- timing (fractions of DUR) ----
type_end = 2.4 / DUR
l1 = 2.9 / DUR
l2 = 3.25 / DUR
l3 = 3.6 / DUR
lsum = 4.05 / DUR
lcap = 4.5 / DUR
fade = 9.6 / DUR   # begin fading out

def appear(begin):
    # opacity envelope over one loop: hidden, then on, then off before restart
    kt = f"0;{begin:.4f};{begin+0.02:.4f};{fade:.4f};{min(fade+0.06,0.999):.4f};1"
    vals = "0;0;1;1;0;0"
    return (f'<animate attributeName="opacity" values="{vals}" keyTimes="{kt}" '
            f'dur="{DUR}s" repeatCount="indefinite" calcMode="linear"/>')

parts = []
parts.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="300" '
             f'viewBox="0 0 {W} 300" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" '
             f'font-size="14">')
parts.append('<title>confdiff — semantic, secret-safe config diff (animated demo)</title>')
# window
parts.append(f'<rect width="{W}" height="300" rx="11" fill="#0d1117"/>')
parts.append(f'<rect width="{W}" height="36" rx="11" fill="#161b22"/>')
parts.append(f'<rect y="26" width="{W}" height="10" fill="#161b22"/>')
parts.append('<circle cx="22" cy="18" r="6" fill="#f66151"/>')
parts.append('<circle cx="42" cy="18" r="6" fill="#e9ad0c"/>')
parts.append('<circle cx="62" cy="18" r="6" fill="#33d17a"/>')
parts.append(f'<text x="{W/2}" y="23" fill="#7d8590" text-anchor="middle" font-size="12">'
             'confdiff — semantic, secret-safe config diff</text>')

# prompt $
parts.append(f'<text x="16" y="{Y_PROMPT}" fill="#3fb950">$</text>')

# typed command, revealed via clip rect that grows (typing effect)
parts.append('<clipPath id="type"><rect x="%d" y="44" height="26" width="0">' % X0)
parts.append(f'<animate attributeName="width" values="0;0;{cmd_w:.1f};{cmd_w:.1f};{cmd_w:.1f};0" '
             f'keyTimes="0;0.03;{type_end:.4f};{fade:.4f};0.999;1" dur="{DUR}s" '
             'repeatCount="indefinite" calcMode="linear"/></rect></clipPath>')
parts.append(f'<g clip-path="url(#type)"><text x="{X0}" y="{Y_PROMPT}" fill="#e6edf3" '
             f'xml:space="preserve">{esc(cmd)}</text></g>')

# cursor: moves with the type reveal, blinks
cur_x0 = X0
cur_x1 = X0 + cmd_w
parts.append(f'<rect y="{Y_PROMPT-12}" width="8" height="16" fill="#e6edf3" x="{cur_x0}">')
parts.append(f'<animate attributeName="x" values="{cur_x0};{cur_x0};{cur_x1:.1f};{cur_x1:.1f}" '
             f'keyTimes="0;0.03;{type_end:.4f};1" dur="{DUR}s" repeatCount="indefinite" calcMode="linear"/>')
parts.append('<animate attributeName="opacity" values="1;0;1" dur="1.05s" repeatCount="indefinite"/>')
parts.append('</rect>')

# output lines (each its own <g> with opacity envelope)
def line(y, segs, begin):
    g = [f'<g opacity="0"><text x="{X0}" y="{y}" xml:space="preserve">']
    for txt, col in segs:
        g.append(f'<tspan fill="{col}">{esc(txt)}</tspan>')
    g.append('</text>')
    g.append(appear(begin))
    g.append('</g>')
    return "".join(g)

YEL = "#d29922"; WHT = "#e6edf3"; GRY = "#6e7681"; BLU = "#a5d6ff"; GRN = "#3fb950"; RED = "#f85149"

parts.append(line(Y_OUT, [
    ("~ ", YEL), ("API_TOKEN    ", WHT),
    ("«redacted:f57ea9»", GRY), (" => ", GRY), ("«redacted:d4a89c»", GRY)], l1))
parts.append(line(Y_OUT+LH, [
    ("~ ", YEL), ("DB_PASSWORD  ", WHT),
    ("«redacted:faac14»", GRY), (" => ", GRY), ("«redacted:726de5»", GRY)], l2))
parts.append(line(Y_OUT+2*LH, [
    ("~ ", YEL), ("LOG_LEVEL    ", WHT),
    ('"info"', BLU), (" => ", GRY), ('"debug"', BLU)], l3))
parts.append(line(Y_OUT+3*LH+8, [
    ("3 changes: ", "#7d8590"), ("3 changed", "#7d8590")], lsum))

# caption selling the "no noise" story
cap_y = Y_OUT + 5*LH + 2
parts.append(f'<g opacity="0"><text x="16" y="{cap_y}" fill="#57ab5a" font-size="12.5" '
             'font-style="italic" xml:space="preserve">'
             '✓ keys reordered + a comment added in staging — reported as 0 noise, only real changes shown</text>')
parts.append(appear(lcap))
parts.append('</g>')

parts.append('</svg>')

svg = "\n".join(parts)
with open("/tmp/demo/demo.svg", "w") as f:
    f.write(svg)
print("bytes:", len(svg), "cmd_w:", round(cmd_w,1))
