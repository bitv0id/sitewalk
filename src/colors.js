const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const wrap = (code) => (value) => (enabled ? `\x1b[${code}m${value}\x1b[0m` : String(value));

export const bold = wrap(1);
export const dim = wrap(2);
export const red = wrap(31);
export const green = wrap(32);
export const yellow = wrap(33);
export const cyan = wrap(36);

export const ok = (value) => bold(green(value));
export const fail = (value) => bold(red(value));
export const warn = (value) => yellow(value);
export const info = (value) => cyan(value);

/** Visible length of a string, ignoring ANSI escape sequences. */
export function plainLength(value) {
    // eslint-disable-next-line no-control-regex -- matching the ANSI escape byte is the entire point
    return String(value).replace(/\x1b\[[0-9;]*m/g, '').length;
}

export function pad(value, width, align = 'left') {
    const diff = width - plainLength(value);
    if (diff <= 0) {
        return String(value);
    }

    return align === 'right' ? ' '.repeat(diff) + value : value + ' '.repeat(diff);
}
