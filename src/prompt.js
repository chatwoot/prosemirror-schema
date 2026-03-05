/* eslint-disable no-plusplus */
const prefix = 'ProseMirror-prompt';

function reportInvalid(dom, message) {
  // FIXME this is awful and needs a lot more work
  let parent = dom.parentNode;
  let msg = parent.appendChild(document.createElement('div'));
  msg.style.left = dom.offsetLeft + dom.offsetWidth + 2 + 'px';
  msg.style.top = dom.offsetTop - 5 + 'px';
  msg.className = 'ProseMirror-invalid';
  msg.textContent = message;
  setTimeout(() => parent.removeChild(msg), 1500);
}

function getValues(fields, domFields) {
  let result = Object.keys(fields)
    .filter((name, index) => {
      let field = fields[name];
      let dom = domFields[index];
      let value = field.read(dom);
      let bad = field.validate(value);

      if (bad) reportInvalid(dom, bad);
      return !bad;
    })
    .reduce((acc, name, index) => {
      let field = fields[name];
      let dom = domFields[index];
      let value = field.read(dom);
      acc[name] = field.clean(value);
      return acc;
    }, {});
  return result;
}

export function openPrompt(options) {
  // Use a native <dialog> element so it renders in the browser's top layer,
  // automatically appearing above everything including other open dialogs.
  let dialog = document.createElement('dialog');
  dialog.className = prefix + '-backdrop';

  // Create the prompt wrapper (the visible dialog box)
  let wrapper = document.createElement('div');
  wrapper.className = prefix;
  dialog.appendChild(wrapper);

  document.body.appendChild(dialog);
  dialog.showModal();

  const close = () => {
    if (dialog.open) dialog.close();
    if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
  };

  // Close when clicking the backdrop (outside the wrapper)
  dialog.addEventListener('mousedown', e => {
    if (e.target === dialog) close();
  });

  // Handle native cancel event (e.g. Escape key)
  dialog.addEventListener('cancel', e => {
    e.preventDefault();
    close();
  });

  let domFields = [];

  Object.values(options.fields).map(field => domFields.push(field.render()));

  let submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className =
    'button tiny button--save-link ' + prefix + '-submit';
  submitButton.textContent = 'Create Link';
  let cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'button tiny hollow secondary' + prefix + '-cancel';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', close);

  let form = wrapper.appendChild(document.createElement('form'));
  if (options.title) {
    const titleDom = document.createElement('h5');
    titleDom.className = 'sub-block-title';
    form.appendChild(titleDom).textContent = options.title;
  }
  domFields.forEach(field => {
    form.appendChild(document.createElement('div')).appendChild(field);
  });
  let buttons = form.appendChild(document.createElement('div'));
  buttons.className = prefix + '-buttons';
  buttons.appendChild(submitButton);
  buttons.appendChild(document.createTextNode(' '));
  buttons.appendChild(cancelButton);

  let submit = () => {
    let params = getValues(options.fields, domFields);
    if (params) {
      close();
      options.callback(params);
    }
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    submit();
  });

  form.addEventListener('keydown', e => {
    if (e.key === 'Esc') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Tab') {
      window.setTimeout(() => {
        if (!wrapper.contains(document.activeElement)) close();
      }, 500);
    }
  });

  let input = form.elements[0];
  if (input) input.focus();
}
