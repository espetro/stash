export class PayloadDecodeError extends Error {
    constructor(message) {
        super(message);
        this.name = "PayloadDecodeError";
    }
}
