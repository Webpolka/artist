/*------------------------------------------------------------------------------------------------------------------------------
TRANSFER ELEMENTS CLASS 
------------------------------------------------------------------------------------------------------------------------------*/
class TransferElements {
	constructor(...objectsWithParameters) {
		if (objectsWithParameters.length === 0) {
			throw TypeError("at least one object with parameters must be specified for the constructor");
		}

		const sourceElements = [];

		const validatedObjectsWithParameters = objectsWithParameters.map((objectWithParameters) => {
			if (this.#getObjectType(objectWithParameters) !== "[object Object]") {
				throw TypeError(`the arguments specified for the constructor must be objects of type 'Object'`);
			}

			["sourceElement", "breakpoints"].forEach((parameterKey) => {
				if (!Object.hasOwn(objectWithParameters, parameterKey)) {
					throw TypeError(`the '${parameterKey}' parameter is not specified for the main object`);
				}
			});

			const { sourceElement, breakpoints } = objectWithParameters;

			if (!(sourceElement instanceof Element)) {
				throw TypeError(`the value specified for the 'sourceElement' parameter must be an object of type 'Element'`);
			}

			if (sourceElements.includes(sourceElement)) {
				throw TypeError(
					`there can only be one object in the constructor with such a 'sourceElement': '${sourceElement.cloneNode().outerHTML}'`
				);
			}

			sourceElements.push(sourceElement);

			objectWithParameters.breakpoints = this.#assembleBreakpoints(breakpoints, sourceElement);

			return objectWithParameters;
		});

		const sortedBreakpointTriggers = [
			...validatedObjectsWithParameters
				.reduce(
					(collection, { breakpoints }) => {
						Object.keys(breakpoints).forEach((breakpointTrigger) => {
							if (Number(breakpointTrigger)) {
								collection.add(breakpointTrigger);
							}
						});

						return collection;
					},

					new Set()
				)
				.add("default"),
		].sort((a, b) => a - b);

		const storageOfBreakpoints = sortedBreakpointTriggers.reduce(
			(storage, breakpointTrigger) => {
				storage.set(breakpointTrigger, []);

				return storage;
			},

			new Map()
		);

		validatedObjectsWithParameters.forEach(({ sourceElement, breakpoints }) => {
			Object.entries(breakpoints).forEach(([breakpointTrigger, { targetElement, targetPosition }]) => {
				storageOfBreakpoints.get(breakpointTrigger).push({
					sourceElement,
					targetElement,
					targetPosition,
				});
			});
		});

		storageOfBreakpoints.forEach((breakpointObjects) => {
			this.#sortBreakpointObjects(breakpointObjects);

			this.#removeSourceElements(breakpointObjects);
			this.#insertSourceElements(breakpointObjects, true);

			breakpointObjects.length = 0;

			sourceElements.forEach((sourceElement) => {
				breakpointObjects.push(this.#generateBreakpointObject(sourceElement, true));
			});

			this.#sortBreakpointObjects(breakpointObjects);
		});

		let previousBreakpointTrigger = "default";

		const resizeObserver = new ResizeObserver(
			([
				{
					borderBoxSize: [{ inlineSize }],
					target,
				},
			]) => {
				const currentWidth = inlineSize + this.#getScrollbarWidth(target);

				const currentBreakpointTrigger = this.#getBreakpointTrigger(sortedBreakpointTriggers, currentWidth);

				if (previousBreakpointTrigger !== currentBreakpointTrigger) {
					const breakpointObjects = storageOfBreakpoints.get(currentBreakpointTrigger);

					this.#removeSourceElements(breakpointObjects);
					this.#insertSourceElements(breakpointObjects, false);

					previousBreakpointTrigger = currentBreakpointTrigger;
				}
			}
		);

		resizeObserver.observe(document.documentElement);
	}

	#assembleBreakpoints(breakpoints, sourceElement) {
		if (this.#getObjectType(breakpoints) !== "[object Object]") {
			throw TypeError(`the value specified for the 'breakpoints' parameter must be an object of type 'Object'`);
		}

		const breakpointEntries = Object.entries(breakpoints);

		if (breakpointEntries.length === 0) {
			throw TypeError(`at least one breakpoint must be specified for the 'breakpoints' object`);
		}

		const validatedBreakpoints = Object.fromEntries(
			breakpointEntries.map(([breakpointTrigger, breakpointObject]) => {
				const breakpointTriggerAsNumber = Number(breakpointTrigger);

				if (!breakpointTriggerAsNumber || breakpointTriggerAsNumber <= 0 || breakpointTriggerAsNumber > Number.MAX_SAFE_INTEGER) {
					throw RangeError(`the breakpoint trigger must be a safe (integer or fractional) number greater than zero`);
				}

				if (this.#getObjectType(breakpointObject) !== "[object Object]") {
					throw TypeError(`the breakpoint object must be of type 'Object'`);
				}

				if (!Object.hasOwn(breakpointObject, "targetElement")) {
					throw TypeError(`the 'targetElement' parameter is not specified for the breakpoint object`);
				}

				const { targetElement, targetPosition } = breakpointObject;

				if (!(targetElement instanceof Element)) {
					throw TypeError(`the value specified for the 'targetElement' parameter must be an object of type 'Element'`);
				}

				if (sourceElement === targetElement) {
					throw TypeError(
						`the value specified for the 'targetElement' parameter must be different from the value specified for the 'sourceElement' parameter`
					);
				}

				if (this.#isTargetElementDescendantOfSourceElement(targetElement, sourceElement)) {
					throw TypeError(
						`the element that is specified as the value for the 'targetElement' parameter must not be a descendant of the element specified as the value for the 'sourceElement' parameter`
					);
				}

				if (this.#isTagOfTargetElementSelfClosing(targetElement)) {
					throw TypeError(`the element specified as the value for the 'targetElement' parameter must be a paired tag`);
				}

				if (Object.hasOwn(breakpointObject, "targetPosition")) {
					if (typeof targetPosition !== "number") {
						throw TypeError(`the value specified for the 'targetPosition' parameter must be of type 'number'`);
					}

					if (targetPosition < 0 || !Number.isSafeInteger(targetPosition)) {
						throw RangeError(
							`the number specified as the value for the 'targetPosition' parameter must be a non-negative safe integer`
						);
					}
				}

				return [
					breakpointTriggerAsNumber,
					{
						targetPosition: targetPosition ?? 0,

						...breakpointObject,
					},
				];
			})
		);

		validatedBreakpoints.default = this.#generateBreakpointObject(sourceElement, false);

		return validatedBreakpoints;
	}

	#getChildElementsOfTargetElement(targetElement) {
		return targetElement.children;
	}

	#getBreakpointTrigger(breakpointTriggers, currentWidth) {
		let startIndex = 0;
		let endIndex = breakpointTriggers.length - 2;
		let savedBreakpointTrigger;

		while (startIndex <= endIndex) {
			const middleIndex = Math.floor((startIndex + endIndex) / 2);
			const guessedBreakpointTrigger = breakpointTriggers[middleIndex];

			if (guessedBreakpointTrigger == currentWidth) {
				return guessedBreakpointTrigger;
			} else if (guessedBreakpointTrigger > currentWidth) {
				endIndex = middleIndex - 1;
			} else {
				startIndex = middleIndex + 1;
			}

			if (guessedBreakpointTrigger - currentWidth > 0) {
				savedBreakpointTrigger = guessedBreakpointTrigger;
			}
		}

		return savedBreakpointTrigger ?? "default";
	}

	#getScrollbarWidth(observableElement) {
		const viewportWidth = window.innerWidth;
		const widthOfObservableElement = Math.min(observableElement.clientWidth, observableElement.offsetWidth);

		let scrollbarWidth = 0;

		if (widthOfObservableElement !== viewportWidth) {
			scrollbarWidth += viewportWidth - widthOfObservableElement;
		}

		return scrollbarWidth;
	}

	#getObjectType(object) {
		return Object.prototype.toString.call(object);
	}

	#isTargetElementDescendantOfSourceElement(targetElement, sourceElement) {
		while ((targetElement = targetElement.parentElement)) {
			if (targetElement === sourceElement) {
				return true;
			}
		}

		return false;
	}

	#isTagOfTargetElementSelfClosing(targetElement) {
		return !new RegExp(/<\/[a-zA-Z]+>$/).test(targetElement.outerHTML);
	}

	#sortBreakpointObjects(breakpointObjects) {
		if (breakpointObjects.length > 1) {
			breakpointObjects.sort((a, b) => a.targetPosition - b.targetPosition);
		}
	}

	#removeSourceElements(breakpointObjects) {
		breakpointObjects.forEach(({ sourceElement }) => {
			sourceElement.remove();
		});
	}

	#insertSourceElements(breakpointObjects, hasCheckOfMaximumTargetPosition) {
		breakpointObjects.forEach(({ sourceElement, targetElement, targetPosition }) => {
			const childElementsOfTargetElement = this.#getChildElementsOfTargetElement(targetElement);

			if (hasCheckOfMaximumTargetPosition) {
				this.#throwExceptionIfMaximumTargetPositionIsExceeded(childElementsOfTargetElement, targetPosition);
			}

			const childElementOfTargetElement = childElementsOfTargetElement[targetPosition];

			if (childElementOfTargetElement) {
				childElementOfTargetElement.before(sourceElement);
			} else {
				targetElement.append(sourceElement);
			}
		});
	}

	#throwExceptionIfMaximumTargetPositionIsExceeded(childElementsOfTargetElement, targetPosition) {
		const maximumTargetPosition = childElementsOfTargetElement.length;

		if (targetPosition > maximumTargetPosition) {
			throw RangeError(
				`the number specified as the value for the 'targetPosition' parameter exceeds the maximum allowed value of '${maximumTargetPosition}'`
			);
		}
	}

	#generateBreakpointObject(sourceElement, isComplete) {
		const parentElementOfSourceElement = sourceElement.parentElement;

		const breakpointObject = {
			targetElement: parentElementOfSourceElement,
			targetPosition: [...parentElementOfSourceElement.children].findIndex(
				(childElementOfSourceElement) => childElementOfSourceElement === sourceElement
			),
		};

		if (isComplete) {
			breakpointObject.sourceElement = sourceElement;
		}

		return breakpointObject;
	}
}

/*------------------------------------------------------------------------------------------------------------------------------
BASEHELPERS CLASS
------------------------------------------------------------------------------------------------------------------------------*/
class BaseHelpers {
	static html = document.documentElement;
	static addTouchClass() {
		if (MobileChecker.isAny) {
			BaseHelpers.html.classList.add("touch");
		}
	}
	static addLoadedClass() {
		window.addEventListener("load", () => {
			setTimeout(() => {
				BaseHelpers.html.classList.add("loaded");
			}, 0);
		});
	}
	static get getHash() {
		return location.hash?.replace("#", "");
	}
	static calcScrollbarWidth() {
		const scrollbarWidth = (window.innerWidth - document.body.clientWidth) / 16 + "rem";
		BaseHelpers.html.style.setProperty("--bh-scrollbar-width", scrollbarWidth);
	}
}
/*------------------------------------------------------------------------------------------------------------------------------
MOBILECHECKERS CLASS
------------------------------------------------------------------------------------------------------------------------------*/
class MobileChecker {
	static userAgent = navigator.userAgent;
	static get isAndroid() {
		return Boolean(MobileChecker.userAgent.match(/Android/i));
	}
	static get isBlackBerry() {
		return Boolean(MobileChecker.userAgent.match(/BlackBerry/i));
	}
	static get isAppleOS() {
		return Boolean(MobileChecker.userAgent.match(/iPhone|iPad|iPod/i));
	}
	static get isOpera() {
		return Boolean(MobileChecker.userAgent.match(/Opera Mini/i));
	}
	static get isWindows() {
		return Boolean(MobileChecker.userAgent.match(/IEMobile/i));
	}
	static get isAny() {
		return (
			MobileChecker.isAndroid ||
			MobileChecker.isBlackBerry ||
			MobileChecker.isAppleOS ||
			MobileChecker.isOpera ||
			MobileChecker.isWindows
		);
	}
}

/* --------------------------------------------------------------------------------------------------------------------------
ACCORDION CLASS
-----------------------------------------------------------------------------------------------------------------------------*/
class Accordion {
	constructor(opts = {}) {
		const defaultConfig = {
			accordion: ".accordion",
			button: ".accordion-btn",
			panel: ".accordion-panel",
			activeClass: "active",
		};

		this.options = Object.assign(defaultConfig, opts);
		this.accordions = document.querySelectorAll(this.options.accordion);

		this.setState();
	}

	listener() {
		this.accordions.forEach((ac) => {
			const btn = ac.querySelector(this.options.button);
			const panel = ac.querySelector(this.options.panel);
			btn.addEventListener("click", (e) => this.slidepanel(e, ac, btn, panel));
		});
	}

	slidepanel(e, ac, btn, panel) {
		panel.classList.toggle(this.options.activeClass);
		if (panel.classList.contains(this.options.activeClass)) {
			panel.style.maxHeight = panel.scrollHeight + "px";
		} else {
			panel.style.maxHeight = "0px";
			ac.classList.remove(this.options.activeClass);
		}
		btn.classList.toggle(this.options.activeClass);

		e.preventDefault();
	}

	setState() {
		this.accordions.forEach((ac) => {
			const btn = ac.querySelector(this.options.button);
			const panel = ac.querySelector(this.options.panel);

			const acActive = ac.classList.contains(this.options.activeClass);
			const btnActive = btn.classList.contains(this.options.activeClass);

			if (btnActive || acActive) {
				btn.classList.add(this.options.activeClass);
				panel.classList.add(this.options.activeClass);
				panel.style.maxHeight = panel.scrollHeight + "px";
			} else {
				btn.classList.remove(this.options.activeClass);
				panel.classList.remove(this.options.activeClass);
				panel.style.maxHeight = "0px";
			}
		});
	}
}

/* --------------------------------------------------------------------------------------------------------------------------
START JAVASCRIPT WORKING CODE
-----------------------------------------------------------------------------------------------------------------------------*/
BaseHelpers.addLoadedClass();
BaseHelpers.calcScrollbarWidth();
BaseHelpers.addTouchClass();

const isEven = (num) => num % 2 === 0;
window.addEventListener("DOMContentLoaded", function () {
	/* --------------------------------------------------------------------------------------------------------------------------
BURGER MENU
-----------------------------------------------------------------------------------------------------------------------------*/

	const burgerBtn = document.querySelector("#mobile-burger");
	const mobileNav = document.querySelector("#mobile-nav");
	const body = document.querySelector("body");

	if (burgerBtn && mobileNav) {
		burgerBtn.addEventListener("click", () => {
			// const mobileTile = mobileNav.querySelector(".mobile-tile");
			// mobileTile.scrollTo({ top: mobileTile.scrollHeight });
			// setTimeout(function () {
			// 	mobileTile.scrollTo({
			// 		top: 0,
			// 		behavior: "smooth",
			// 	});
			// }, 1000);
			mobileNav.classList.toggle("show");
			// body.classList.toggle("no-scroll");
		});

		mobileNav.addEventListener("click", () => {
			// const mobileTile = mobileNav.querySelector(".mobile-tile");
			// mobileTile.scrollTo({
			// 	top: mobileTile.scrollHeight,
			// 	behavior: "smooth",
			// });
			mobileNav.classList.remove("show");
			// body.classList.remove("no-scroll");
		});
	} else {
		console.log("Mobile navigation HTML in DOM is broken !");
	}

	/* --------------------------------------------------------------------------------------------------------------------------
ACCORDION
-----------------------------------------------------------------------------------------------------------------------------*/

	new Accordion({
		accordion: ".accordion",
		button: ".accordion-btn",
		panel: ".accordion-panel",
		activeClass: "active",
	}).listener();

	/* --------------------------------------------------------------------------------------------------------------------------
MAIN TRANSFER BLOCKS
-----------------------------------------------------------------------------------------------------------------------------*/
	const transferContainer = document.getElementById("main-transfer-cont");
	const transferDescription = document.getElementById("main-transfer-desc");

	if (transferContainer && transferDescription) {
		new TransferElements({
			sourceElement: transferDescription,
			breakpoints: {
				768: {
					targetElement: transferContainer,
					targetPosition: 0,
				},
			},
		});
	}

	/* --------------------------------------------------------------------------------------------------------------------------
SHOP PRODUCTS - ADAPTIVE TO 767px SHOW PAIR 
-----------------------------------------------------------------------------------------------------------------------------*/
	const shopProducts = document.querySelector(".products");
	if (shopProducts) {
		const allProducts = shopProducts.querySelectorAll(".product-card");
		const mediaSM = window.matchMedia("(max-width: 765px)");

		remove();
		window.addEventListener("resize", remove);
		function remove() {
			if (mediaSM.matches) {
				if (!isEven(allProducts.length)) {
					allProducts[allProducts.length - 1].style.display = "none";
				}
			} else {
				allProducts[allProducts.length - 1].style.display = "block";
			}
		}
	}

	/* --------------------------------------------------------------------------------------------------------------------------
PAYMENT PLACEHOLDER
-----------------------------------------------------------------------------------------------------------------------------*/
	const expireDate = document.getElementById("expiry-date");
	function updatePlaceholder() {
		if (window.innerWidth < 768) {
			//  Пример ширины экрана для мобильных
			expireDate.placeholder = "MM/YY";
		} else {
			expireDate.placeholder = ""; //  Удалить placeholder для десктопа
		}
	}
	//  Вызвать функцию при загрузке страницы и при изменении размера окна
	if (expireDate) {
		window.onload = updatePlaceholder;
		window.onresize = updatePlaceholder;
	}

	/* --------------------------------------------------------------------------------------------------------------------------
MAIN PAGE - GALLERY SCROLL EQUILIBRIUM
-----------------------------------------------------------------------------------------------------------------------------*/
	const mainGalleryGrid = document.querySelector("#main-gallery-grid");
	const galleryBox = document.querySelector("#main-gallery-box");

	function updateGridHeight() {
		if (window.innerWidth < 768) {
			const item1height = getSumOfChildrenHeight(mainGalleryGrid.querySelector(".item-1"));
			const item2height = getSumOfChildrenHeight(mainGalleryGrid.querySelector(".item-2"));
			const item3height = getSumOfChildrenHeight(mainGalleryGrid.querySelector(".item-3"));
			const item4height = getSumOfChildrenHeight(mainGalleryGrid.querySelector(".item-4"));
			const finishHeight = max(item2height, item4height) + max(item1height, item3height) + 21;

			if (item4height <= item2height) {
				galleryBox.style.minHeight = item2height + "px";
			} else {
				galleryBox.style.minHeight = item4height + "px";
			}

			// console.log("i1 - ", item1height, "i3 - ", item3height);
			// console.log("i4 - ", item4height, "i2 - ", item2height);
			// console.log(finishHeight);
			mainGalleryGrid.style.maxHeight = finishHeight + "px";
		} else {
			mainGalleryGrid.style.removeProperty("max-height");
			galleryBox.style.removeProperty("min-height");
		}
	}
	if (mainGalleryGrid) {
		window.onload = updateGridHeight;
		window.onresize = updateGridHeight;
	}

	/* --------------------------------------------------------------------------------------------------------------------------
EXTRA FUNCTIONS
-----------------------------------------------------------------------------------------------------------------------------*/
	function getSumOfChildrenHeight(parentElement) {
		let sum = 0;
		for (const child of parentElement.children) {
			sum += child.offsetHeight;
		}
		return sum;
	}

	function max(a, b) {
		if (a > b) {
			return a;
		} else {
			return b;
		}
	}

	/* --------------------------------------------------------------------------------------------------------------------------
GALLERY FIRST ARTICLE EXTRA CLASSES
-----------------------------------------------------------------------------------------------------------------------------*/

	const galleryPage = document.querySelector("#gallery-page");
	if (galleryPage) {
		const firstGalleryArticle = galleryPage.querySelector(".gallery-article");
		const firstGalleryArticleDate = firstGalleryArticle.querySelector(".gallery-article_date");
		const firstGalleryArticleTitle = firstGalleryArticle.querySelector(".gallery-article_title");

		if (firstGalleryArticle && firstGalleryArticleDate && firstGalleryArticleTitle) {
			firstGalleryArticleDate.classList.add("first-gallery_date");
			firstGalleryArticleTitle.classList.add("first-gallery_title");
		}
	}

	/* --------------------------------------------------------------------------------------------------------------------------
BLACK HEADER WHEN HOME PAGE
-----------------------------------------------------------------------------------------------------------------------------*/
	const mainAnounce = document.querySelector(".main-anounce");
	const header = document.querySelector(".header");
	if (mainAnounce) {
		header.classList.add("header-black");
	}
});


/* --------------------------------------------------------------------------------------------------------------------------
COOKIES
-----------------------------------------------------------------------------------------------------------------------------*/

const cookieWindow = document.getElementById("cookies-window");
const cookieCloseButton = document.getElementById("cookies-close");

if (cookieCloseButton) {
	cookieCloseButton.addEventListener("click", () => {
		cookieWindow.classList.remove("active");
	});
}

