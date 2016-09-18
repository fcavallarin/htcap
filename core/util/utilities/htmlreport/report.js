

var types = ['xhr','jsonp','websockets', 'forms', 'vulnerabilities','errors'];

function getIcon(type, founds){
	var icons = {
		forms:"F",
		xhr: "X", 
		jsonp: "J",
		errors: null, 
		websockets: "W",
		vulnerabilities:"V"
	};

	if(icons[type] != null){
		var iconclass = founds.indexOf(type) > -1 ? ".icon" : ".icon.icon-hidden";
		return newElement("span" + iconclass,[ 'data-for', type,'title',getLabel(type) ], icons[type]);
	}
	return null;
}


function getLabel(type){
	var labels = {
		forms:"Forms",
		xhr: "XHR", 
		jsonp: "JSONP", 
		errors: "Errors", 
		websockets: "Web Sockets",
		vulnerabilities: "Vulnerabilities"
	};

	if(type in labels)
		return labels[type];

	return null;
}

// code_injection*,file_inclusion*,path_traversal*,rfi*,xss*,xxe*

function getVulnName(type){
	var labels = {
		xss:"Cross Site Scripting (XSS)",
		sqli: "Sql Injection", 
		lfi: "Local File Inclusion", 

	};
	type = type.toLowerCase();
	if(type in labels)
		return labels[type];

	return type;
}


function newElement(name, attributes, content, appendTo){
	var a;
	name = name.split(".");

	var el = document.createElement(name.splice(0,1));
	if(attributes && attributes.length > 0){
		if(attributes.length % 2 != 0) console.error("newEvent: attributes.length must be even");
		for(a = 0; a < attributes.length - 1; a += 2){
			el.setAttribute(attributes[a], attributes[a+1]);
		}
	}

	for(a = 0; a < name.length; a++)
		el.classList.add(name[a]);

	if(content){
		if(content.constructor != Array)
			content = [content];
		for(var cont of content){
			el.appendChild((typeof cont == 'object' && 'tagName' in cont) ? cont : document.createTextNode(cont));
		}
	}

	if(appendTo){
		appendTo.appendChild(el);
	}

	return el;
}

function query(selector, element){
	selector = selector.trim();
	if(selector.match(/^#\S+$/gi) != null){
		// a LOT faster than querySelectorAll
		return document.getElementById(selector.substring(1));
	}
	element = element || document;

	var ret = element.querySelectorAll(selector);


	return ret;

}


function elementHeight(element){
	var style = getComputedStyle(element);
	var margins = parseInt(style.getPropertyValue("margin-top")) + parseInt(style.getPropertyValue("margin-bottom"));
	return element.offsetHeight + margins;
}


function toggleTrashSection(target){
	if(target.parentNode.parentNode.id == "trash"){
		insertSection(target);
	} else{
		query('#trash .modal-content')[0].appendChild(target);
	}
}


function createSection(result){

	var founds = [];
	var urlicons = [];

	// if(!resultHasData(result))
	// 	return;

	if(result.out_of_scope || result.errors.indexOf('contentType') > -1)
		return;


	var accord = newElement("div.mainAccordion.accordion.accordion-closed");

	var parent = newElement("a.parent-url",['href',result.referer, 'target', '_blank','title','parent url'], result.referer);
	accord.appendChild(parent);
	for(var i = 0; i < types.length; i++){
		if(!(types[i] in result) || result[types[i]].length == 0) continue;
		founds.push(types[i]);
		var hdr = newElement("p.result-accordion-hdr.hdr-accordion.hdr-accordion-open",['data-for',types[i]], getLabel(types[i]), accord);
		hdr.onclick = function(){toggleAccordion(this)};
		newElement("span.result-counter",[],"",hdr)

		var resAccord = newElement("div.results.accordion",['data-for',types[i]]);
		for(var a = 0; a < result[types[i]].length; a++){
			var req = result[types[i]][a];

			if(types[i] == "errors"){
				cont = req;
			} else {
				if(req.request){
					var trigger = newElement("span.trigger",["data-trigger", req.trigger], "☍");
					if(req.trigger){
						trigger.onclick = function(){
							this.textContent = this.textContent.length > 1 ? "☍" : this.getAttribute('data-trigger');
						}
						trigger.setAttribute("title","trigger element: " + req.trigger)
					} else {
						trigger.className += " empty"
					}

					var cont = [trigger];
					if(typeof req.request == 'string'){
						cont.push(req.request);
					} else {
						cont.push(req.request[0] + " ");
						cont.push(newElement("span.result-post-data", [], req.request[1]));
					}
				}

				//var cont = req.trigger + "-->" + result[types[i]][a].request;
				if(types[i] == "vulnerabilities"){//console.log(req)
					var vcont = JSON.parse(req);
					cont = newElement("span.vuln-name",[], getVulnName(vcont.type));
					cont.onclick = (function(c){return function(){
						openModal("#vulnerability", newElement("pre",[],c));
					}})(vcont.description);

				} 
			}
			newElement("div.result",[], cont, resAccord);

		}
		accord.appendChild(resAccord);
	}

	var section = newElement("section",[
		"data-id", result.id,
		"data-method", result.method,
		"data-post-data", (result.data ? result.data : ""),
		"data-url", result.url, 
		"data-index", result.index, 
		"data-founds",founds.join(","),
		"title", "Request ID: " + result.id
	]);
	var urlclass = ".url";
	var urlattrs = [];
	if('errors' in result && result.errors.length > 0){
		urlclass += ".url-error";
		urlattrs.push("title", "ERRORS");
	}

	var link_label = [(result.method == "POST" ? "POST " : "") + decodeURI(result.url)];
	if(result.data){
		link_label.push(" ");
		link_label.push(newElement("span.url-post-data", ['title','POST data'], result.data));
	}
	var link = newElement("span" + urlclass + ".hdr-accordion.hdr-accordion-closed", urlattrs, link_label);
	var ics = newElement("span.icons");

	for(var a = 0; a < types.length; a++){
		var ico = getIcon(types[a], founds);
		if(ico) ics.appendChild(ico)
	}


	link.onclick = function(){toggleAccordion(this)}
	var openico = newElement("a.open-new-win", ['href', result.url, 'target', '_blank', 'title', 'open in new window']);
	if(result.method == "POST"){
		openico.setAttribute("data-post-data", result.data ? result.data : "");
		openico.onclick = function(e){
			postForm(this.href, this.getAttribute("data-post-data"));
			e.preventDefault();
		}
	}

	var trash = newElement("a.trash-button.button",[], 'trash');
	trash.onclick = (function(target){ return function(){
		toggleTrashSection(target);
	}})(section);
	var next = newElement("a.next-button.button",[], 'next');
	next.onclick = (function(target){ return function(){
		nextSection(target);
	}})(section);

	var mark = newElement("a.mark-button.button",[], 'mark');
	mark.onclick = (function(target){ return function(){
		target.classList.toggle("marked");
	}})(section);

	newElement("div.resbuttons",[],[next,mark,trash], accord);

	// 2 sec senza crearli
	// 4.5 sec senza appen
	// 6 sec hidden
	// 9 sec full

	section.appendChild(ics);
	section.appendChild(openico);
	section.appendChild(link);
	section.appendChild(accord);

	result.html_element = section;
	//}
}





function createSections(limit){
	var results = report.results;
	var cont = query("#report");

	var url;
	var cnt = 0;
	var index = 0;
	for(var a = 0; a < results.length; a++){

		if('html_element' in results[a]){
			index++;
			continue;
		}

		if(cnt == limit){
			break;
		}


		createSection(results[a], index);
		if('html_element' in results[a]){

			cont.appendChild(results[a].html_element);
			results[a].index = index;			 

			index++;
			cnt++;
		}
	}

	if(cnt > 0)
		filter();

}






function insertSection(section){
	var index = parseInt(section.getAttribute("data-index"));
	var sections = query("#report section");
	var next = null;
	for(var a = 0; a < sections.length; a++){
		if(parseInt(sections[a].getAttribute("data-index")) > index){
			next = sections[a];
			break;
		}
	}

	query("#report").insertBefore(section, next);

}


function sortSections(){
	return


	var cont = query('#report');
	var secs = query("section .url", cont);

	if(secs.length < 2){
		return;
	}
	var list = [];
	for(var a = 0; a < secs.length;a++){
		list.push(secs[a]);
	}


	list = list.sort(function(a,b){
		if(a.textContent.toLowerCase() == b.textContent.toLowerCase())
			return 0;
		return a.textContent.toLowerCase() > b.textContent.toLowerCase() ? 1 : -1; 
	})

	// for(var a = 0 ;a < list.length;a++)
	// 	console.log(list[a].textContent.toLowerCase())

	var next = secs[0].parentNode;
	for(var a = 0; next && a < secs.length; a++){
		cont.insertBefore(list[a].parentNode, next);
		next = list[a].parentNode.nextSibling;
	}
}




function toggleAccordion(el,forceState){
	var st = {open: 'accordion-open', closed:'accordion-closed'};
	if(!el) return;
	var hdr = el;
	do{
		if(el && el.className && el.classList.contains("accordion")/*el.className.split(" ").indexOf('accordion') > -1*/)
			break;
	} while(el = el.nextSibling);

	if(!el) return;

	do{
		if(hdr && hdr.classList.contains("hdr-accordion"))
			break
	}while(hdr = hdr.previousSibling);

	var state;

	if(forceState){
		state = forceState;
	} else{
		state = el.classList.contains(st.open) ? "closed" : "open";
	}

	if(state == "closed"){
		el.classList.add(st.closed);
		el.classList.remove(st.open);
		if(hdr){
			hdr.classList.add("hdr-" + st.closed);
			hdr.classList.remove("hdr-" + st.open);
		}
	} else {
		el.classList.add(st.open);
		el.classList.remove(st.closed);
		if(hdr){
			hdr.classList.add("hdr-" + st.open);
			hdr.classList.remove("hdr-" + st.closed);
		}
	}

}


// function filterResultAccordion(element){
// 	var els = query(".results", element);
// 	for(var a = 0; a < els.length; a++){
// 		console.log(els[a])
// 		var state = query('#opt_'+els[a].getAttribute("data-for")).checked ? "open" : "close";
// 		toggleAccordion(els[a], state);
// 	}
// }






function filterSections(showFilters){


	// alemeno un el di a1 e' contenuto in a2
	var arraysub = function(a1, a2){
		for(var a = 0; a < a2.length; a++){
			if(a1.indexOf(a2[a]) > -1)
				return true
		}
		return false;
	}

	var errcont = query("#error_container");
	errcont.innerText = '';


	els = query("#report section");
	for(var a = 0; a < els.length; a++){
		var founds = els[a].getAttribute("data-founds");
		if(!founds)continue;
		///console.log(founds.split(","))
		els[a].classList[!arraysub(showFilters, founds.split(",")) ? 'add' : 'remove']('hidden');
	}


	// // url hider filter
	// var regexp = query('#urlhider').value.replace(/\n/g,"");
	// var rows = query("[data-url]");

	// for(var a = 0; a < rows.length; a++){
	// 	var method = rows[a].getAttribute("data-method") ? rows[a].getAttribute("data-method") + " " : "";
	// 	var url = method + rows[a].getAttribute("data-url") + " " + rows[a].getAttribute("data-post-data");
	// 	if(!rows[a].classList.contains("hidden")){ // already hidden by checkbox filter
	// 		try{
	// 			rows[a].classList[(regexp == "" || url.trim().match(new RegExp(regexp,"gi")) == null) ? 'remove' : 'add']('hidden');
	// 		}catch(e){
	// 			errcont.innerText = e.message;
	// 		}
	// 	}
	// }

}



function filter(fromindex){
	fromindex = fromindex || 0;


	var errcont = query("#error_container");
	errcont.innerText = '';
	// checkbox filters
	var els = query("#filters").getElementsByTagName("input");
	var sel = [];
	var sum = 0;
	for(var a = 0; a < els.length; a++){
		if(els[a].checked == true){
			sel.push(els[a].name);
			sum++;
		}
	}
	var af = query("#allfilters");
	af.checked = sum >= (els.length/2) ? true : false;
	af.indeterminate = (sum > 0 && sum != els.length) ? true : false;

	filterSections(sel);


	// url hider filter
	var regexp = query('#urlhider').value.replace(/\n/g,"");
	var rows = query("[data-url]");

	for(var a = 0; a < rows.length; a++){
		var method = rows[a].getAttribute("data-method") ? rows[a].getAttribute("data-method") + " " : "";
		var url = method + rows[a].getAttribute("data-url") + " " + rows[a].getAttribute("data-post-data");
		if(!rows[a].classList.contains("hidden")){ // already hidden by checkbox filter
			try{
				rows[a].classList[(regexp == "" || url.trim().match(new RegExp(regexp,"gi")) == null) ? 'remove' : 'add']('hidden');
			}catch(e){
				errcont.innerText = e.message;
			}
		}
	}



	// // url hider filter
	// var regexp = query('#urlhider').value.replace(/\n/g,"");
	// var rows = query("[data-url]");

	// for(var a = 0; a < rows.length; a++){
	// 	var url = rows[a].getAttribute("data-url");
	// 	if(!rows[a].classList.contains("hidden")){ // already hidden by checkbox filter
	// 		try{
	// 			rows[a].classList[(regexp == "" || url.match(new RegExp(regexp,"gi")) == null) ? 'remove' : 'add']('hidden');
	// 		}catch(e){
	// 			errcont.innerText = e.message;
	// 		}
	// 	}
	// }


	// results hider filter
	var regexp = query('#reshider').value.replace(/\n/g,"");
	var rows = query(".result");
	for(var a = 0; a < rows.length; a++){
		var cont = rows[a].textContent;
		try{
			rows[a].classList[(regexp == "" || cont.match(new RegExp(regexp,"gi")) == null) ? 'remove' : 'add']('hidden');
		}catch(e){
			errcont.innerText = e.message;
		}
	}


	//results accoridion autocollapse and counting
	els = query('#report section');
	for(var a = 0; a < els.length; a++){
		var res = query('.mainAccordion .results',els[a]);

		for(var b = 0; b < res.length; b++){
			var counter = query(".result-counter",res[b].previousSibling)[0];
			counter.textContent = query(".result",res[b]).length;
			var state = query('#opt_'+res[b].getAttribute("data-for")).checked;
			toggleAccordion(res[b], state ? "open" : "closed");
		}
	}

	// set icon red if resutl is filtered
	els = query("#report section");
	for(var a = 0; a < els.length; a++){
		var ics = els[a].querySelectorAll(".icon");
		for(var b = 0; b < ics.length; b++){
			var sel = '.results[data-for="'+ics[b].getAttribute('data-for')+'"] .result:not(.hidden)';
			var n = els[a].querySelector(sel);
			//console.log("-->"+n)
			ics[b].classList[n  ? 'remove':'add']("icon-filtered");

		}
	}

}


function postForm(url, data){
	data = data.split(/(?:&amp;|&)+/);
	var form = newElement("form.hidden", ['method','POST', 'action', url, 'target','_blank']);
	for(var a = 0; a < data.length; a++){
		var d = data[a].split(/=(.*)/);
		newElement("input", ['name', d[0], 'value', d[1]], [], form);
	}
	form.submit();
}


function openMarked(){
	var cont = query("#marked .modal-content")[0];
	var marked = query("#report section.marked");
	if(marked.length == 0) return;

	for(var a = 0; a < marked.length; a++){
		cont.appendChild(marked[a]);
	}
	var hidden = query(".hidden",cont);
	for(var a = 0; a < hidden.length; a++){
		hidden[a].classList.remove('hidden');
		hidden[a].classList.add('was-hidden');
	}
	query("#marked").classList.remove("hidden");
	document.querySelector("body").style.overflow = 'hidden';
}

function closeMarked(){
	if(query("#marked").classList.contains("hidden"))return;
	var hidden = query(".was-hidden",query("#marked .modal-content")[0]);
	for(var a = 0; a < hidden.length; a++){
		hidden[a].classList.add('hidden');
		hidden[a].classList.remove('was-hidden');
	}
	document.querySelector("body").style.overflow = 'visible';
	query('#marked').classList.add("hidden");
	var els = query('#marked .modal-content section');
	for(var a = 0; a < els.length; a++){
		//query("#report").appendChild(els[a]);
		insertSection(els[a])
	}
	//sortSections();

}

function nextSection(current){

	var cont = getComputedStyle(current.parentNode).getPropertyValue('overflow') == 'auto' ? current.parentNode : document.body;
	toggleAccordion(query(".mainAccordion",current)[0]);
	//console.log(elementHeight(current))
	cont.scrollTop = document.body.scrollTop + elementHeight(current);

	var next = current.nextSibling;
	while(next){
		if(!next.classList.contains('hidden')){
			break
		}
		next = next.nextSibling;
	} 

	if(next)
		toggleAccordion(query(".mainAccordion",next)[0], "open");
}


function addRegexp(target){
	var txt = window.getSelection().toString();
	if(txt == "") return;
	var cont = query(target);
	// quote string for regesp
	//txt = "(" + txt.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1") + ")";
	txt = "(" + txt.replace(/([.*+?^${}()|\[\]\\])/g, "\\$1") + ")";
	if(cont.value != ""){
		txt = cont.value + "|" + txt;
	}
	cont.value = txt;
	cont.onblur();

}

// check if result has data so section will be created
function resultHasData(result){
	if('out_of_scope' in result)
		return false;
	for(var a = 0; a < types.length; a++){
		if(types[a] in result && result[types[a]].length > 0)
			return true;
	}

	return false;
}

function openModal(selector, content){
	document.querySelector("body").style.overflow = 'hidden';
	query(selector).classList.remove("hidden");

	if(content){
		var c = query(selector +  " .modal-content")[0];
		c.innerHTML = "";
		c.appendChild(content);
	}
}

function closeModal(selector){
	document.querySelector("body").style.overflow = 'visible';
	if(selector){
		query(selector).classList.add("hidden");
	} else {
		var modals = query(".modal");
		for(var a = 0; a < modals.length; a++){
			modals[a].classList.add("hidden");
		}
	}
}

function saveStatus(){
	var a;
	var status = {
		shown: [],
		marked:[],
		trashed:[],
		hideUrls: "",
		hideResults: "",
		notes: ""

	};
	if(!query("#save_status").classList.contains("hidden")){
		query("#save_status").classList.add("hidden");
		return;
	}
	var shown = query("#filters input");
	for(a = 0; a < shown.length; a++){
		if(shown[a].checked)
			status.shown.push(shown[a].id);
	}
	var marked = query("#report section.marked");
	for(a = 0; a < marked.length; a++){
		status.marked.push(marked[a].getAttribute("data-index"));
	}

	var trashed = query("#trash section");
	for(a = 0; a < trashed.length; a++){
		status.trashed.push(trashed[a].getAttribute("data-index"));
	}

	status.hideUrls = query("#urlhider").value;
	status.hideResults = query("#reshider").value;
	status.notes = query("#notes textarea")[0].value;

	var blob = new Blob([JSON.stringify(status)], {type: "application/octet-stream"});
	query("#save_status a")[0].href = window.URL.createObjectURL(blob);
	query("#save_status").classList.remove("hidden");
	query("#save_status input")[0].focus();

}

function loadStatus(file){
	var reader = new FileReader();

	reader.onload = function(event) {
		var doFilter = false;
		try{
			var status = JSON.parse(event.target.result);
		} catch(e){
			query("#error_container").innerText = e;
			return;
		}
		if('shown' in status){
			var shown = query("#filters input");
			for(var a = 0; a < shown.length; a++){
				var checked = status.shown.indexOf(shown[a].id) != -1;
				if(!doFilter) 
					doFilter = shown[a].checked != checked;
				shown[a].checked = checked;
			}
		}
		if('marked' in status){
			for(var a = 0; a < status.marked.length; a++){
				// any section, both from #report and #trash
				var sec = document.querySelector('section[data-index="'+status.marked[a]+'"]');
				if(sec) sec.classList.add("marked");
			}
		}
		if('trashed' in status){
			for(var a = 0; a < status.trashed.length; a++){
				// trash only section in #report
				var sec = document.querySelector('#report section[data-index="'+status.trashed[a]+'"]');
				if(sec) toggleTrashSection(sec);
			}
		}

		if('hideUrls' in status){
			var hu = query("#urlhider");
			if(!doFilter)
				doFilter = hu.value != status.hideUrls;
			hu.value = status.hideUrls;
		}
		if('hideResults' in status){
			var hr = query("#reshider");
			if(!doFilter)
				doFilter = hr.value != status.hideResults;
			hr.value = status.hideResults;
		}

		if('notes' in status){
			query("#notes textarea")[0].value = status.notes;
		}

		if(doFilter){
			filter();
		}

		var ssi = query("#save_status input")[0];
		ssi.value = file.name
		ssi.onblur();
	};

	reader.readAsText(file);
}


function initGUI(){

	var infos = report.infos;

	var filters = query("#filters");

	query("#htcap_version").textContent = infos.htcap_version;

	query('#allfilters').onchange = function(){
		var f = query('#filters').getElementsByTagName("input");
		for(var a = 0; a < f.length; a++)
			f[a].checked = this.checked;
		filter();
	}

	query('#urlhider').onblur = filter;
	query('#reshider').onblur = filter;

	query('#trash-close').onclick = function(){
		closeModal("#trash");
	}

	query('#vulnerability-close').onclick = function(){
		closeModal("#vulnerability");
	}

	query('#notes-close').onclick = function(){
		closeModal("#notes");
	}

	query('#marked-close').onclick = closeMarked;

	query('#outofscope-close').onclick = function(){
		closeModal("#outofscope");
	};

	var btn;
	var buttons = query("#buttons");

	//btn = newElement("span.button",[],"open marked",buttons);
	query("#marked-open").onclick = openMarked

	query("#trash-open").onclick = function(){
		openModal("#trash");
	}

	query("#notes-open").onclick = function(){
		openModal("#notes");
		query("#notes textarea")[0].focus();
	}

	query("#collapse-all").onclick = function(){
		var els = query("#report section .mainAccordion");
		for(var a = 0; a < els.length; a++){
			toggleAccordion(els[a],'closed');
		}
	}

	//btn = newElement("span.button",[],"expand visibles",buttons);
	query("#expand-visibles").onclick = function(){
		var els = query("#report section:not(.hidden) .mainAccordion");
		for(var a = 0; a < els.length; a++){
			toggleAccordion(els[a],'open');
		}
	}

	query("#outofscope-open").onclick = function(){
		document.querySelector("body").style.overflow = 'hidden';
		query("#outofscope").classList.remove("hidden");
	}


	query("#nonhtml-open").onclick = function(){
		openModal("#nonhtml");
	}
	query('#nonhtml-close').onclick = function(){
		closeModal("#nonhtml");
	};


	query("#save-status").onclick = function(){
		saveStatus();
	};

	query("#save_status input")[0].onblur = function(){
		query("#save_status a")[0].download = this.value || this.placeholder;
	}
	query("#save_status a")[0].onclick = function(){
		query("#save_status").classList.add("hidden");
	};

	query("#load_status_input").onchange = function(){
		loadStatus(this.files[0]);
	}

	//newElement("span",['id','error_container'],'',buttons);


	document.addEventListener("mouseup", function(e){
		var txt = window.getSelection().toString();
		query("#add_result_regexp").classList[(txt == "" ? 'add' : 'remove')]("hidden");
		query("#add_url_regexp").classList[(txt == "" ? 'add' : 'remove')]("hidden");
	});

	query("#add_result_regexp").onmousedown = function(){addRegexp('#reshider')};
	query("#add_url_regexp").onmousedown = function(){addRegexp('#urlhider')};

	var scan_time = parseInt((infos.end_date - infos.start_date) / 60);
	if(scan_time < 0){
		scan_time = "-1";
	}
	var scan_date = (new Date(parseInt(infos.start_date) * 1000)).toString();
	query('#infos_target').appendChild(document.createTextNode(infos.target));
	query('#infos_scan_date').appendChild(document.createTextNode(scan_date));
	query('#infos_scanned_urls').appendChild(document.createTextNode(infos.pages_crawled));
	query('#infos_scan_time').appendChild(document.createTextNode(scan_time + " minutes"));
	query('#infos_commandline').appendChild(document.createTextNode("crawl " + infos.commandline));

	for(var i = 0; i < types.length; i++){
		var l = types[i];

		var opt = newElement('input',['type','checkbox','id','opt_'+l,'name',l,'checked',true]);
		opt.onchange = filter;

		//var opt_l = newElement("label",['for',opt.id], labels[l] + " ")
		var opt_l = newElement("label",['for',opt.id], getLabel(l) + " ")

		filters.appendChild(opt);
		filters.appendChild(opt_l);
	}


	window.onscroll = (function(height){return function(){
		var h = height - window.pageYOffset;
		query("#collapse_top").style.height = (h > -1 ? h : 0) + "px";

	}})(elementHeight(query("#collapse_top")));

	document.onkeydown = function(e){
		if(e.keyCode == 27){
			closeMarked();
			closeModal();
		}
	}
}


function initReport(){

	var results = report.results;


	initGUI();

	var tot_outofscope = 0;
	var tot_nonhtml = 0;
	var index = 0;
	var modalurl;
	for(var a = 0; a < results.length; a++){

		if('out_of_scope' in results[a] || results[a].errors.indexOf('contentType') > -1){
			if('out_of_scope' in results[a]){
				modalurl = newElement("p",[],null, query("#outofscope .modal-content")[0]);
				tot_outofscope++;
			} else {
				modalurl = newElement("p",[],null, query("#nonhtml .modal-content")[0]);
				tot_nonhtml++;
			}
			newElement("a.url",['href',results[a].url, 'target','_blank'],results[a].url, modalurl);
			newElement("br",[],"",modalurl);
			newElement("a.parent-url",['href',results[a].referer, 'target','_blank','title','parent url'], results[a].referer, modalurl);

		}

		if(resultHasData(results[a])){
			results[a].index = index++;
		}

	}

	createSections(-1);

	query("#infos_outofscope").textContent = tot_outofscope;
	query("#infos_nonhtml").textContent = tot_nonhtml;

	var links = query("a");
	for(var a = 0; a < links.length; a++){
		links[a].setAttribute('tabindex', "-1");
	}

	//query("body")[0].style.paddingTop = 20 + elementHeight(query("#top")) + "px";
	query("#report").style.marginTop = 20 + elementHeight(query("#top")) + "px";


	window.onbeforeunload = function(e){
		var mess = "Are you sure?"
		return mess;
	};

}